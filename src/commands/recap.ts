import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";

import { summarizeRecap } from "../services/openrouter.js";
import { env } from "../utils/env.js";

const DEFAULT_MESSAGE_LIMIT = 40;
const MAX_THREAD_PARENTS = 10;
const MAX_THREAD_REPLIES_PER_PARENT = 25;

type SlackHistoryMessage = {
  text?: string;
  user?: string;
  subtype?: string;
  ts?: string;
  thread_ts?: string;
  reply_count?: number;
};

type ThreadedSlackHistoryMessage = SlackHistoryMessage & {
  threadReplies?: SlackHistoryMessage[];
};

type SlackLogger = {
  warn: (...args: unknown[]) => void;
};

const getMessageLimit = (text: string): number => {
  const requestedLimit = Number.parseInt(text.trim(), 10);

  if (Number.isNaN(requestedLimit)) {
    return DEFAULT_MESSAGE_LIMIT;
  }

  return Math.min(Math.max(requestedLimit, 5), 100);
};

const getMessageTimestamp = (message: SlackHistoryMessage): string | undefined => message.ts ?? message.thread_ts;

const compareByTimestamp = (a: SlackHistoryMessage, b: SlackHistoryMessage): number => {
  return Number.parseFloat(getMessageTimestamp(a) ?? "0") - Number.parseFloat(getMessageTimestamp(b) ?? "0");
};

const formatMessage = (message: SlackHistoryMessage, prefix = ""): string | null => {
  const text = message.text?.trim();

  if (!text || message.subtype === "bot_message") {
    return null;
  }

  const author = message.user ? `<@${message.user}>` : "unknown";

  return `${prefix}${author}: ${text}`;
};

const fetchThreadReplies = async (
  client: WebClient,
  channel: string,
  messages: SlackHistoryMessage[],
  logger: SlackLogger
): Promise<ThreadedSlackHistoryMessage[]> => {
  const topLevelTimestamps = new Set(
    messages.map(getMessageTimestamp).filter((timestamp): timestamp is string => Boolean(timestamp))
  );
  const threadParents = messages
    .filter((message) => (message.reply_count ?? 0) > 0 && Boolean(getMessageTimestamp(message)))
    .slice(0, MAX_THREAD_PARENTS);
  const repliesByThreadTs = new Map<string, SlackHistoryMessage[]>();

  await Promise.all(
    threadParents.map(async (message) => {
      const threadTs = getMessageTimestamp(message);

      if (!threadTs) {
        return;
      }

      try {
        const replies = await client.conversations.replies({
          channel,
          ts: threadTs,
          limit: MAX_THREAD_REPLIES_PER_PARENT + 1
        });
        const threadReplies = ((replies.messages ?? []) as SlackHistoryMessage[])
          .filter((reply) => {
            const replyTs = getMessageTimestamp(reply);

            return Boolean(replyTs && replyTs !== threadTs && !topLevelTimestamps.has(replyTs));
          })
          .sort(compareByTimestamp)
          .slice(0, MAX_THREAD_REPLIES_PER_PARENT);

        repliesByThreadTs.set(threadTs, threadReplies);
      } catch (error) {
        logger.warn("Failed to fetch Slack thread replies for recap", { threadTs, error });
      }
    })
  );

  return messages.map((message) => {
    const threadTs = getMessageTimestamp(message);

    if (!threadTs) {
      return message;
    }

    return {
      ...message,
      threadReplies: repliesByThreadTs.get(threadTs) ?? []
    };
  });
};

const formatTranscript = (messages: ThreadedSlackHistoryMessage[]): string => {
  const transcriptLines: string[] = [];

  for (const message of messages.slice().reverse()) {
    const formattedMessage = formatMessage(message);

    if (formattedMessage) {
      transcriptLines.push(formattedMessage);
    }

    for (const reply of message.threadReplies ?? []) {
      const formattedReply = formatMessage(reply, "  thread reply - ");

      if (formattedReply) {
        transcriptLines.push(formattedReply);
      }
    }
  }

  return transcriptLines.join("\n");
};

const trimWrappingAsterisks = (text: string): string => text.replace(/^\*+|\*+$/g, "");

const formatRecapForSlack = (recap: string): string => {
  return recap
    .trim()
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, (_, heading: string) => `*${trimWrappingAsterisks(heading.trim())}*`)
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/^\s*\d+\.\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n");
};

// Slash command handlers live in this folder so future commands can be added
// without crowding the main app bootstrap file.
export const registerRecapCommand = (app: App) => {
  app.command("/recap", async ({ ack, command, client, respond, logger }) => {
    try {
      await ack();

      await respond({
        text: "Creating a recap from recent channel messages...",
        response_type: "ephemeral"
      });

      const limit = getMessageLimit(command.text);
      const history = await client.conversations.history({
        channel: command.channel_id,
        limit
      });

      const messagesWithThreadReplies = await fetchThreadReplies(
        client,
        command.channel_id,
        (history.messages ?? []) as SlackHistoryMessage[],
        logger
      );
      const transcript = formatTranscript(messagesWithThreadReplies);

      if (!transcript) {
        await respond({
          text: "I could not find enough recent human-written messages to recap.",
          response_type: "ephemeral"
        });
        return;
      }

      const recap = await summarizeRecap({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL,
        channelName: command.channel_name,
        transcript
      });
      const slackRecap = formatRecapForSlack(recap);

      await respond({
        text: `*Recap for #${command.channel_name}*\n${slackRecap}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Recap for #${command.channel_name}*\n${slackRecap}`
            }
          }
        ],
        response_type: "ephemeral"
      });
    } catch (error) {
      logger.error("Failed to handle /recap command", error);

      await respond({
        text: "Sorry, I could not create a recap. Check the bot logs for details.",
        response_type: "ephemeral"
      });
    }
  });
};

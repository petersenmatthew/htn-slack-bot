import type { App } from "@slack/bolt";

import { summarizeRecap } from "../services/openrouter.js";
import { env } from "../utils/env.js";

const DEFAULT_MESSAGE_LIMIT = 40;

type SlackHistoryMessage = {
  text?: string;
  user?: string;
  subtype?: string;
};

const getMessageLimit = (text: string): number => {
  const requestedLimit = Number.parseInt(text.trim(), 10);

  if (Number.isNaN(requestedLimit)) {
    return DEFAULT_MESSAGE_LIMIT;
  }

  return Math.min(Math.max(requestedLimit, 5), 100);
};

const formatMessage = (message: SlackHistoryMessage): string | null => {
  const text = message.text?.trim();

  if (!text || message.subtype === "bot_message") {
    return null;
  }

  const author = message.user ? `<@${message.user}>` : "unknown";

  return `${author}: ${text}`;
};

const formatTranscript = (messages: SlackHistoryMessage[]): string => {
  return messages
    .slice()
    .reverse()
    .map(formatMessage)
    .filter((message): message is string => Boolean(message))
    .join("\n");
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

      const transcript = formatTranscript(history.messages ?? []);

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

      await respond({
        text: `*Recap for #${command.channel_name}*\n${recap}`,
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

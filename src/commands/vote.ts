import { randomUUID } from "node:crypto";

import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";

import { getSlackUserProfile } from "../services/slack-user.js";
import { addVote } from "../services/vote-store.js";

type MentionToken =
  | { type: "id"; userId: string }
  | { type: "name"; username: string };

const parseCommand = (
  text: string
): { mentions: MentionToken[]; reason: string } | null => {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  // Match both <@USERID|name> (from autocomplete) and plain @name (typed manually)
  const mentionRe = /(?:<@([A-Z0-9]+)(?:\|[^>]+)?>|@([\w.]+))/g;
  const mentions: MentionToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRe.exec(trimmed)) !== null) {
    if (match[1]) {
      mentions.push({ type: "id", userId: match[1] });
    } else if (match[2]) {
      mentions.push({ type: "name", username: match[2] });
    }
    lastIndex = mentionRe.lastIndex;
  }

  if (mentions.length === 0) {
    return null;
  }

  const reason = trimmed.slice(lastIndex).trim();

  if (!reason) {
    return null;
  }

  return { mentions, reason };
};

const resolveUserId = async (
  client: WebClient,
  username: string
): Promise<string | null> => {
  const result = await client.users.list({});
  const members = result.members ?? [];
  const lower = username.toLowerCase();

  const found = members.find(
    (m) =>
      m.name?.toLowerCase() === lower ||
      m.profile?.display_name?.toLowerCase() === lower ||
      m.real_name?.toLowerCase() === lower
  );

  return found?.id ?? null;
};

export const registerVoteCommand = (app: App) => {
  app.command("/vote", async ({ ack, command, client, logger }) => {
    try {
      await ack();

      logger.info(`/vote received`, { user: command.user_id, text: command.text });

      const parsed = parseCommand(command.text);

      if (!parsed) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: "Usage: `/vote @user1 @user2 <reason>`\nMention at least one user and provide a reason."
        });
        return;
      }

      const { mentions, reason } = parsed;

      // Resolve all mentions to user IDs
      const resolvedIds: string[] = [];
      const unresolved: string[] = [];

      for (const mention of mentions) {
        if (mention.type === "id") {
          resolvedIds.push(mention.userId);
        } else {
          const id = await resolveUserId(client, mention.username);
          if (id) {
            resolvedIds.push(id);
          } else {
            unresolved.push(`@${mention.username}`);
          }
        }
      }

      if (unresolved.length > 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          text: `Could not find workspace members for: ${unresolved.join(", ")}. Try using Slack's @mention autocomplete.`
        });
        return;
      }

      const voter = await getSlackUserProfile(client, command.user_id);
      const now = new Date().toISOString();

      for (const userId of resolvedIds) {
        const target = await getSlackUserProfile(client, userId);

        await addVote({
          id: randomUUID(),
          votedForUserId: userId,
          votedForName: target.name,
          votedByUserId: command.user_id,
          votedByName: voter.name,
          reason,
          timestamp: now
        });
      }

      const mentions2 = resolvedIds.map((id) => `<@${id}>`).join(", ");

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `✅ Vote recorded against ${mentions2}.`
      });

      await client.chat.postMessage({
        channel: command.channel_id,
        text: `🗳️ <@${command.user_id}> voted against ${mentions2}\n> _${reason}_`
      });
    } catch (error) {
      logger.error("Failed to handle /vote command", { error: String(error) });

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: `Something went wrong recording your vote: ${String(error)}`
      }).catch(() => {
        // last-resort: if postEphemeral also fails, at least it's logged above
      });
    }
  });
};

import type { App } from "@slack/bolt";

import { getRecord, listRecords } from "../services/blackmail-store.js";
import type { BlackmailRecord } from "../types/blackmail.js";

/**
 * Extract the Slack user ID and display name from command text.
 * Slack sends mentions as `<@U0B5ULW537B>` or `<@U0B5ULW537B|claire>`.
 */
const extractMention = (text: string): { userId: string; username: string } | null => {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  // Match Slack's mention format: <@USERID> or <@USERID|username>
  const mentionMatch = trimmed.match(/^<@([A-Z0-9]+)(?:\|([^>]+))?>/);
  if (mentionMatch) {
    return {
      userId: mentionMatch[1],
      username: mentionMatch[2] ?? mentionMatch[1]
    };
  }

  // Fallback: plain text like "claire" or "@claire"
  return {
    userId: "",
    username: trimmed.replace(/^@/, "").toLowerCase()
  };
};

/**
 * Find a record by Slack user ID first, then fall back to a name search.
 */
const findRecord = async (userId: string, username: string): Promise<BlackmailRecord | null> => {
  // Direct lookup by user ID (fast path)
  if (userId) {
    const record = await getRecord(userId);
    if (record) {
      return record;
    }
  }

  // Fallback: search all records by name (case-insensitive)
  const allRecords = await listRecords();
  const lowerUsername = username.toLowerCase();

  return (
    allRecords.find(
      (r) =>
        r.name.toLowerCase() === lowerUsername ||
        r.name.toLowerCase().startsWith(lowerUsername)
    ) ?? null
  );
};

export const registerBlackmailCommand = (app: App) => {
  app.command("/blackmail", async ({ ack, command, client, respond, logger }) => {
    try {
      await ack();

      const mention = extractMention(command.text);

      if (!mention) {
        await respond({
          text: "Usage: `/blackmail @username`",
          response_type: "ephemeral"
        });
        return;
      }

      const record = await findRecord(mention.userId, mention.username);

      if (!record) {
        await respond({
          text: `No blackmail found for @${mention.username}. They must be clean… for now. :eyes:`,
          response_type: "ephemeral"
        });
        return;
      }

      if (!record.blackmailPhoto) {
        await respond({
          text: `@${record.name} is registered but hasn't uploaded their blackmail photo yet. :hourglass_flowing_sand:`,
          response_type: "ephemeral"
        });
        return;
      }

      // Post the blackmail photo publicly in the channel
      await client.chat.postMessage({
        channel: command.channel_id,
        text: `:rotating_light: *BLACKMAIL RELEASED* :rotating_light:\n<@${record.slackUserId}>'s embarrassing photo has been exposed!`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:rotating_light: *BLACKMAIL RELEASED* :rotating_light:\n\n<@${record.slackUserId}>'s embarrassing photo has been exposed!`
            }
          },
          {
            type: "image",
            image_url: record.blackmailPhoto,
            alt_text: `${record.name}'s blackmail photo`
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Uploaded: ${record.dateUploaded ? new Date(record.dateUploaded).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "unknown"} · Exposed by <@${command.user_id}>`
              }
            ]
          }
        ]
      });
    } catch (error) {
      logger.error("Failed to handle /blackmail command", error);

      await respond({
        text: "Sorry, I could not retrieve any blackmail. Check the bot logs for details.",
        response_type: "ephemeral"
      });
    }
  });
};

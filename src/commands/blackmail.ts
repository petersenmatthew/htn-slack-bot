import type { App } from "@slack/bolt";

const BLACKMAIL_DATABASE: Record<string, string> = {
  claire: "claire loves cursor",
  samantha: "samantha has a secret stash of snacks in her desk",
  will: "will has a hidden collection of vintage video games",
  matthew: "matthew once accidentally sent a meme to the entire company instead of just his friend"
};

const extractUsername = (text: string): string | null => {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const mentionMatch = trimmed.match(/^<@[^|>]+\|([^>]+)>/);
  if (mentionMatch) {
    return mentionMatch[1].toLowerCase();
  }

  return trimmed.replace(/^@/, "").toLowerCase();
};

export const registerBlackmailCommand = (app: App) => {
  app.command("/blackmail", async ({ ack, command, respond, logger }) => {
    try {
      await ack();

      const username = extractUsername(command.text);

      if (!username) {
        await respond({
          text: "Usage: `/blackmail @username`",
          response_type: "ephemeral"
        });
        return;
      }

      const blackmail = BLACKMAIL_DATABASE[username];

      if (!blackmail) {
        await respond({
          text: `No blackmail found for @${username}. They must be clean. For now.`,
          response_type: "ephemeral"
        });
        return;
      }

      await respond({
        text: `:lock: Blackmail on @${username}: ${blackmail}`,
        response_type: "ephemeral"
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

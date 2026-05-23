import type { App } from "@slack/bolt";

const WORKING_MESSAGE = "✅ Recap bot is connected and working.";

// Slash command handlers live in this folder so future commands can be added
// without crowding the main app bootstrap file.
export const registerRecapCommand = (app: App) => {
  app.command("/recap", async ({ ack, respond, logger }) => {
    try {
      await ack();

      await respond({
        text: WORKING_MESSAGE,
        response_type: "ephemeral"
      });
    } catch (error) {
      logger.error("Failed to handle /recap command", error);
    }
  });
};

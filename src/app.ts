import "dotenv/config";

import { App, LogLevel } from "@slack/bolt";

import { registerBlackmailCommand } from "./commands/blackmail.js";
import { registerPhotoSlidesCommand } from "./commands/photoslides.js";
import { registerRecapCommand } from "./commands/recap.js";
import { registerUploadCommand } from "./commands/upload.js";
import { registerVoteCommand } from "./commands/vote.js";
import { env } from "./utils/env.js";

// This file is the bot's entry point: it creates the Bolt app, wires command
// handlers, and starts the Socket Mode connection for local development.
const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: env.SLACK_APP_TOKEN,
  logLevel: LogLevel.INFO
});

registerRecapCommand(app);
registerPhotoSlidesCommand(app);
registerUploadCommand(app);
registerBlackmailCommand(app);
registerVoteCommand(app);

app.error(async (error) => {
  console.error("Slack app error:", error);
});

const start = async () => {
  try {
    await app.start();
    console.log("⚡ Slack Recap Bot running");
  } catch (error) {
    console.error("Failed to start Slack Recap Bot:", error);
    process.exit(1);
  }
};

void start();

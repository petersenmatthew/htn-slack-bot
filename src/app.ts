import "dotenv/config";

import { App, LogLevel } from "@slack/bolt";

import { registerBlackmailCommand } from "./commands/blackmail.js";
import { registerRecapCommand } from "./commands/recap.js";
import { registerUploadCommand } from "./commands/upload.js";
import { env } from "./utils/env.js";

// This file is the bot's entry point: it creates the Bolt app, wires command
// handlers, and starts the Socket Mode connection for local development.
const app = new App({
  token: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: env.SLACK_APP_TOKEN,
  logLevel: LogLevel.DEBUG
});

// DEBUG: catch ALL events to see what Slack is sending
app.use(async ({ body, next, logger }) => {
  logger.info(`[MIDDLEWARE] event type=${(body as any).event?.type} subtype=${(body as any).event?.subtype} command=${(body as any).command}`);
  if ((body as any).event?.files) {
    logger.info(`[MIDDLEWARE] files=${JSON.stringify((body as any).event.files.map((f: any) => ({ id: f.id, mimetype: f.mimetype, filetype: f.filetype })))}`);
  }
  await next();
});

registerRecapCommand(app);
registerUploadCommand(app);
registerBlackmailCommand(app);

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

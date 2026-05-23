import type { App, SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/types";

type SlackMessageFile = NonNullable<GenericMessageEvent["files"]>[number];
import type { Logger } from "@slack/logger";
import type { WebClient } from "@slack/web-api";

import { listRecords } from "../services/blackmail-store.js";
import { clearPendingUpload, hasPendingUpload, markPendingUpload } from "../services/pending-upload.js";
import { saveUploadFromFile } from "../services/upload-photo.js";
import type { BlackmailRecord } from "../types/blackmail.js";
import { isDirectMessageChannel } from "../utils/slack-channel.js";

type CommandWithFiles = SlackCommandMiddlewareArgs["command"] & {
  files?: Array<{ id: string }>;
};

const DM_ONLY_MESSAGE =
  "Use `/upload` in a direct message with this bot so your photo stays private. Open the bot's profile and click *Message*.";

const AWAITING_PHOTO_MESSAGE = [
  "Send your embarrassing photo in this DM as your *next message* (drag in an image or use the + button).",
  "",
  "You have 15 minutes. Run `/upload` again to restart."
].join("\n");

const USAGE = [
  "Run these in a DM with the bot only:",
  "1. `/upload`",
  "2. Send your photo in the chat right after",
  "",
  "*`/upload status`* — see who has uploaded this year"
].join("\n");

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
};

const formatStatusTable = (records: BlackmailRecord[]): string => {
  if (records.length === 0) {
    return "_No uploads yet. Be the first to add your blackmail photo._";
  }

  const lines = records.map((record) => {
    const uploaded = record.dateUploaded ? "✅" : "⏳";
    const released = record.dateReleased ? formatDate(record.dateReleased) : "—";
    const photo = record.blackmailPhoto ? `<${record.blackmailPhoto}|view>` : "—";

    return `${uploaded} *${record.name}* · ${record.role} · uploaded ${formatDate(record.dateUploaded)} · photo ${photo} · released ${released}`;
  });

  return lines.join("\n");
};

const isImageFile = (file: SlackMessageFile): boolean => {
  if (file.mimetype?.startsWith("image/")) {
    return true;
  }

  const imageTypes = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"]);
  return imageTypes.has((file.filetype ?? "").toLowerCase());
};

const getImageFileId = (files: GenericMessageEvent["files"]): string | null => {
  const image = files?.find(isImageFile);
  return image?.id ?? null;
};

const handleStatus = async (respond: SlackCommandMiddlewareArgs["respond"]) => {
  const records = await listRecords();

  await respond({
    text: `*Blackmail upload tracker*\n${formatStatusTable(records)}`
  });
};

const startAwaitingPhoto = async (
  userId: string,
  respond: SlackCommandMiddlewareArgs["respond"]
) => {
  markPendingUpload(userId);

  await respond({
    text: `${AWAITING_PHOTO_MESSAGE}\n\n${USAGE}`
  });
};

const completeUpload = async (
  client: WebClient,
  userId: string,
  fileId: string,
  reply: (text: string) => Promise<unknown>,
  logger: Logger
) => {
  clearPendingUpload(userId);

  const result = await saveUploadFromFile(client, userId, fileId);
  await reply(result.message);

  if (result.ok) {
    logger.info(`Blackmail upload saved for ${userId}`);
  }
};

const handleSlashUpload = async ({
  command,
  client,
  respond,
  logger
}: {
  command: CommandWithFiles;
  client: WebClient;
  respond: SlackCommandMiddlewareArgs["respond"];
  logger: Logger;
}) => {
  const attachedFileId = command.files?.[0]?.id;

  if (attachedFileId) {
    await completeUpload(client, command.user_id, attachedFileId, (text) => respond({ text }), logger);
    return;
  }

  await startAwaitingPhoto(command.user_id, respond);
};

const handleDmPhotoMessage = async ({
  event,
  client,
  say,
  logger
}: {
  event: GenericMessageEvent;
  client: WebClient;
  say: (text: string) => Promise<unknown>;
  logger: Logger;
}) => {
  if (event.subtype || event.bot_id || !event.user || !isDirectMessageChannel(event.channel)) {
    return;
  }

  if (!hasPendingUpload(event.user)) {
    return;
  }

  const fileId = getImageFileId(event.files);

  if (!fileId) {
    await say("Still waiting for your photo — send an image file in this DM.");
    return;
  }

  await completeUpload(client, event.user, fileId, say, logger);
};

export const registerUploadCommand = (app: App) => {
  app.command("/upload", async ({ ack, command, client, respond, logger }) => {
    try {
      await ack();

      if (!isDirectMessageChannel(command.channel_id)) {
        await respond({
          response_type: "ephemeral",
          text: DM_ONLY_MESSAGE
        });
        return;
      }

      if (command.text.trim().toLowerCase() === "status") {
        await handleStatus(respond);
        return;
      }

      if (command.text.trim() !== "") {
        await respond({
          text: `No extra text needed.\n\n${USAGE}`
        });
        return;
      }

      await handleSlashUpload({ command: command as CommandWithFiles, client, respond, logger });
    } catch (error) {
      logger.error("Failed to handle /upload command", error);

      const payload = {
        text: "Something went wrong saving your upload. Try again in a moment."
      };

      await respond(
        isDirectMessageChannel(command.channel_id)
          ? payload
          : { ...payload, response_type: "ephemeral" as const }
      );
    }
  });

  app.message(async ({ message, client, say, logger }) => {
    if (message.subtype || !("user" in message) || !message.user || ("bot_id" in message && message.bot_id)) {
      return;
    }

    try {
      await handleDmPhotoMessage({
        event: message as GenericMessageEvent,
        client,
        say: (text) => say(text),
        logger
      });
    } catch (error) {
      logger.error("Failed to handle upload photo message", error);
      clearPendingUpload(message.user);

      if ("channel" in message && isDirectMessageChannel(message.channel)) {
        await say("Something went wrong saving your upload. Run `/upload` and try again.");
      }
    }
  });
};

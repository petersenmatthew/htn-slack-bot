import type { App } from "@slack/bolt";
import type { AllMessageEvents } from "@slack/types";
import type { WebClient } from "@slack/web-api";

import { getRecord } from "../services/blackmail-store.js";
import { addImageToLastSlide } from "../services/google-photo-slides.js";
import {
  clearPendingBlackmail,
  getPendingBlackmail,
  startPendingBlackmail
} from "../services/pending-blackmail.js";
import { parseGoogleSlidesPresentationId } from "../services/slack-thread-photos.js";
import type { SlackThreadPhoto } from "../services/slack-thread-photos.js";
import { getTopVotedUser, listVotesForUser } from "../services/vote-store.js";
import type { BlackmailRecord } from "../types/blackmail.js";
import { env } from "../utils/env.js";

const isHumanMessage = (event: AllMessageEvents): event is AllMessageEvents & { user: string; channel: string } => {
  if (!("user" in event) || !event.user || ("bot_id" in event && event.bot_id)) {
    return false;
  }

  const subtype = "subtype" in event ? event.subtype : undefined;
  return subtype === undefined;
};

const getMessageText = (event: AllMessageEvents): string => {
  if (!("text" in event)) {
    return "";
  }

  return event.text?.trim() ?? "";
};

const replyToChannel = async (
  client: WebClient,
  channel: string,
  text: string
): Promise<void> => {
  await client.chat.postMessage({ channel, text });
};

/**
 * Extract the Slack file ID from a permalink like:
 * https://workspace.slack.com/files/UXXXX/FXXXX/filename.png
 */
const extractFileIdFromPermalink = (permalink: string): string | null => {
  const match = permalink.match(/\/files\/[^/]+\/(F[A-Z0-9]+)/);
  return match?.[1] ?? null;
};

/**
 * Download the blackmail photo from Slack, following the same approach as
 * the photoslides command: files.info → url_private_download → fetch with token.
 */
const downloadBlackmailPhoto = async (
  client: WebClient,
  record: BlackmailRecord
): Promise<SlackThreadPhoto> => {
  if (!record.blackmailPhoto) {
    throw new Error(`${record.name} has no blackmail photo on file.`);
  }

  const fileId = extractFileIdFromPermalink(record.blackmailPhoto);

  if (!fileId) {
    throw new Error(`Could not extract Slack file ID from: ${record.blackmailPhoto}`);
  }

  const result = await client.files.info({ file: fileId });
  const file = result.file;

  if (!file) {
    throw new Error("Slack did not return file metadata.");
  }

  const downloadUrl = file.url_private_download ?? file.url_private;

  if (!downloadUrl) {
    throw new Error(`No downloadable URL for file ${fileId}.`);
  }

  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to download file from Slack: ${response.status} ${response.statusText}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const mimeType =
    file.mimetype ??
    (["jpg", "jpeg"].includes((file.filetype ?? "").toLowerCase())
      ? "image/jpeg"
      : `image/${file.filetype ?? "png"}`);

  return {
    fileId,
    name: file.name ?? file.title ?? `${record.name}-blackmail`,
    mimeType,
    data
  };
};

/**
 * Run the full blackmail reveal: download photo, add to last slide, post in channel.
 */
const runBlackmailReveal = async ({
  client,
  channel,
  triggeredByUserId,
  record,
  voteCount,
  presentationId
}: {
  client: WebClient;
  channel: string;
  triggeredByUserId: string;
  record: BlackmailRecord;
  voteCount: number;
  presentationId: string;
}): Promise<void> => {
  const photo = await downloadBlackmailPhoto(client, record);

  // Collect vote reasons for the slide
  const votes = await listVotesForUser(record.slackUserId);
  const voteReasons = votes
    .map((v) => v.reason)
    .filter((r) => r && r.trim().length > 0)
    .slice(0, 3);

  const result = await addImageToLastSlide({
    photo,
    presentationId,
    voteReasons
  });

  await client.chat.postMessage({
    channel,
    text: `:star: *WEEKLY STAR* :star: <@${record.slackUserId}> was voted this weeks mvp! Photo added to slide ${result.slideNumber}.
https://docs.google.com/presentation/d/${presentationId}/edit`
  });
};

export const registerBlackmailCommand = (app: App) => {
  app.command("/blackmail", async ({ ack, command, client, respond, logger }) => {
    try {
      await ack();

      if (command.text.trim().toLowerCase() === "cancel") {
        clearPendingBlackmail(command.channel_id, command.user_id);
        await respond({
          response_type: "in_channel",
          text: "Cancelled the blackmail reveal."
        });
        return;
      }

      // Tally votes and find the top voted person
      const topVoted = await getTopVotedUser();

      if (!topVoted) {
        await respond({
          text: "No votes have been cast yet! Use `/vote` first.",
          response_type: "ephemeral"
        });
        return;
      }

      // Check if the top voted person has a blackmail photo
      const record = await getRecord(topVoted.userId);

      if (!record || !record.blackmailPhoto) {
        await respond({
          text: `:rotating_light: *${topVoted.name}* has the most votes (${topVoted.voteCount}) but hasn't uploaded a blackmail photo yet. They got lucky… for now. :eyes:`,
          response_type: "in_channel"
        });
        return;
      }

      // If a Google Slides link was provided inline, use it directly
      if (command.text.trim()) {
        const presentationId = parseGoogleSlidesPresentationId(command.text.trim());

        if (presentationId) {
          await respond({
            response_type: "in_channel",
            text: `:star: *WEEKLY STAR* :star:\n\n<@${record.slackUserId}> (${topVoted.name}) received the most votes (${topVoted.voteCount}) and their photo is being added to the slideshow…`
          });

          await runBlackmailReveal({
            client,
            channel: command.channel_id,
            triggeredByUserId: command.user_id,
            record,
            voteCount: topVoted.voteCount,
            presentationId
          });
          return;
        }
      }

      // Start guided flow — ask for Google Slides link
      startPendingBlackmail(command.channel_id, command.user_id);

      await respond({
        response_type: "in_channel",
        text: [
          `:star: *WEEKLY STAR* :star:`,
          ``,
          `<@${record.slackUserId}> (${topVoted.name}) has the most votes with *${topVoted.voteCount}* vote${topVoted.voteCount === 1 ? "" : "s"}!`,
          ``,
          `Now send the Google Slides link to add their photo to the last slide.`,
          `Run \`/blackmail cancel\` to stop.`
        ].join("\n")
      });
    } catch (error) {
      logger.error("Failed to handle /blackmail command", error);

      await respond({
        text: "Sorry, I could not process the blackmail. Check the bot logs for details.",
        response_type: "ephemeral"
      });
    }
  });

  // Listen for follow-up messages in the guided flow
  app.event("message", async ({ event, client, logger }) => {
    if (!isHumanMessage(event)) {
      return;
    }

    const session = getPendingBlackmail(event.channel, event.user);

    if (!session) {
      return;
    }

    const text = getMessageText(event);
    const reply = (message: string) => replyToChannel(client, event.channel, message);

    try {
      if (text.toLowerCase() === "cancel") {
        clearPendingBlackmail(event.channel, event.user);
        await reply("Cancelled the blackmail reveal.");
        return;
      }

      if (!text) {
        await reply("Send the Google Slides link, or type `cancel` to stop.");
        return;
      }

      const presentationId = parseGoogleSlidesPresentationId(text);

      if (!presentationId) {
        await reply("I could not understand that Google Slides link. Send the deck link or presentation ID, or type `cancel`.");
        return;
      }

      clearPendingBlackmail(event.channel, event.user);

      // Re-fetch the top voted user (in case votes changed)
      const topVoted = await getTopVotedUser();

      if (!topVoted) {
        await reply("No votes found. Something went wrong.");
        return;
      }

      const record = await getRecord(topVoted.userId);

      if (!record || !record.blackmailPhoto) {
        await reply(`${topVoted.name} no longer has a blackmail photo on file. They got lucky!`);
        return;
      }

      await reply(`:rotating_light: Adding <@${record.slackUserId}>'s blackmail photo to the slideshow…`);

      await runBlackmailReveal({
        client,
        channel: event.channel,
        triggeredByUserId: event.user,
        record,
        voteCount: topVoted.voteCount,
        presentationId
      });
    } catch (error) {
      clearPendingBlackmail(event.channel, event.user);
      logger.error(`Failed to handle blackmail setup message: ${error instanceof Error ? error.message : error}`);
      await reply("Sorry, I could not add the blackmail photo to the slideshow. Check the bot logs for details.");
    }
  });
};

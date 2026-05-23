import type { App } from "@slack/bolt";
import type { AllMessageEvents } from "@slack/types";
import type { WebClient } from "@slack/web-api";

import { populateWeeklyPhotoSlide } from "../services/google-photo-slides.js";
import {
  clearPendingPhotoSlides,
  getPendingPhotoSlides,
  startPendingPhotoSlides,
  updatePendingPhotoSlides
} from "../services/pending-photo-slides.js";
import {
  getSlackThreadPhotos,
  parseGoogleSlidesPresentationId,
  parsePhotoSlidesCommand,
  parsePositiveInteger,
  parseThreadReference
} from "../services/slack-thread-photos.js";
import { env } from "../utils/env.js";

const USAGE = [
  "Run `/photoslides` to start a guided setup.",
  "",
  "Usage: `/photoslides <thread-link-or-thread-ts> <google-slides-link-or-id> slide=N`",
  "",
  "Examples:",
  "`/photoslides https://your-workspace.slack.com/archives/C123/p1716400000000000?thread_ts=1716400000.000000&cid=C123 https://docs.google.com/presentation/d/SLIDES_ID/edit slide=3`",
  "`/photoslides 1716400000.000000 deck=https://docs.google.com/presentation/d/SLIDES_ID/edit slide=3`"
].join("\n");

const formatSkipped = (skipped: Array<{ name: string; reason: string }>): string => {
  if (skipped.length === 0) {
    return "";
  }

  const shown = skipped.slice(0, 5).map((file) => `- ${file.name}: ${file.reason}`);
  const remaining = skipped.length - shown.length;

  return [
    "",
    `Skipped ${skipped.length} unsupported or unreadable file${skipped.length === 1 ? "" : "s"}:`,
    ...shown,
    remaining > 0 ? `- ...and ${remaining} more.` : ""
  ]
    .filter(Boolean)
    .join("\n");
};

const START_MESSAGE = [
  "Let's build the photo slide.",
  "",
  "First, send the Slack thread link or thread timestamp.",
  "Run `/photoslides cancel` to stop."
].join("\n");

const getSafeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};

const getMessageText = (event: AllMessageEvents): string => {
  if (!("text" in event)) {
    return "";
  }

  return event.text?.trim() ?? "";
};

const isHumanMessage = (event: AllMessageEvents): event is AllMessageEvents & { user: string; channel: string } => {
  if (!("user" in event) || !event.user || ("bot_id" in event && event.bot_id)) {
    return false;
  }

  const subtype = "subtype" in event ? event.subtype : undefined;
  return subtype === undefined;
};

const replyToChannel = async (
  client: WebClient,
  channel: string,
  text: string
): Promise<void> => {
  await client.chat.postMessage({ channel, text });
};

const runPhotoSlides = async ({
  client,
  parsed,
  reply
}: {
  client: WebClient;
  parsed: NonNullable<ReturnType<typeof parsePhotoSlidesCommand>>;
  reply: (text: string) => Promise<void>;
}): Promise<void> => {
  await reply("Collecting photos from that thread and updating Google Slides...");

  const { photos, skipped } = await getSlackThreadPhotos(client, env.SLACK_BOT_TOKEN, parsed.thread);

  if (photos.length === 0) {
    await reply(`I could not find any PNG, JPEG, or GIF images in that thread.${formatSkipped(skipped)}`);
    return;
  }

  const result = await populateWeeklyPhotoSlide({
    photos,
    presentationId: parsed.presentationId,
    slideNumber: parsed.slideNumber
  });

  await reply(
    [
      `Added ${result.insertedCount} photo${result.insertedCount === 1 ? "" : "s"} to slide ${result.slideNumber}.`,
      `https://docs.google.com/presentation/d/${parsed.presentationId}/edit`,
      formatSkipped(skipped)
    ]
      .filter(Boolean)
      .join("\n")
  );
};

export const registerPhotoSlidesCommand = (app: App) => {
  app.command("/photoslides", async ({ ack, command, client, respond, logger }) => {
    try {
      await ack();

      if (command.text.trim().toLowerCase() === "cancel") {
        clearPendingPhotoSlides(command.channel_id, command.user_id);
        await respond({
          response_type: "in_channel",
          text: "Cancelled the photo slide setup."
        });
        return;
      }

      if (command.text.trim() === "") {
        startPendingPhotoSlides(command.channel_id, command.user_id);
        await respond({
          response_type: "in_channel",
          text: START_MESSAGE
        });
        return;
      }

      const parsed = parsePhotoSlidesCommand(command.text, command.channel_id);

      if (!parsed) {
        await respond({
          response_type: "in_channel",
          text: USAGE
        });
        return;
      }

      await runPhotoSlides({
        client,
        parsed,
        reply: (text) =>
          respond({
            response_type: "in_channel",
            text
          }).then(() => undefined)
      });
    } catch (error) {
      logger.error(`Failed to handle /photoslides command: ${getSafeErrorMessage(error)}`);

      await respond({
        response_type: "in_channel",
        text: "Sorry, I could not update the photo slide. Check the bot logs for details."
      });
    }
  });

  app.event("message", async ({ event, client, logger }) => {
    if (!isHumanMessage(event)) {
      return;
    }

    const session = getPendingPhotoSlides(event.channel, event.user);

    if (!session) {
      return;
    }

    const text = getMessageText(event);
    const reply = (message: string) => replyToChannel(client, event.channel, message);

    try {
      if (text.toLowerCase() === "cancel") {
        clearPendingPhotoSlides(event.channel, event.user);
        await reply("Cancelled the photo slide setup.");
        return;
      }

      if (!text) {
        await reply("Send the requested text value, or type `cancel` to stop.");
        return;
      }

      if (session.step === "thread") {
        const thread = parseThreadReference(text, event.channel);

        if (!thread) {
          await reply("I could not understand that thread link. Send a Slack thread link or thread timestamp, or type `cancel`.");
          return;
        }

        updatePendingPhotoSlides({
          ...session,
          threadInput: text,
          step: "presentation"
        });
        await reply("Great. Now send the Google Slides link or presentation ID.");
        return;
      }

      if (session.step === "presentation") {
        const presentationId = parseGoogleSlidesPresentationId(text);

        if (!presentationId) {
          await reply("I could not understand that Google Slides link. Send the deck link or presentation ID, or type `cancel`.");
          return;
        }

        updatePendingPhotoSlides({
          ...session,
          presentationInput: text,
          step: "slide"
        });
        await reply("Got it. Now send the slide number.");
        return;
      }

      const thread = session.threadInput ? parseThreadReference(session.threadInput, event.channel) : null;
      const presentationId = session.presentationInput ? parseGoogleSlidesPresentationId(session.presentationInput) : null;
      const slideNumber = parsePositiveInteger(text);

      if (!slideNumber) {
        await reply("I could not understand that slide number. Send a number like `3`, or type `cancel`.");
        return;
      }

      if (!thread || !presentationId) {
        clearPendingPhotoSlides(event.channel, event.user);
        await reply("Something went wrong with the saved setup. Run `/photoslides` and try again.");
        return;
      }

      clearPendingPhotoSlides(event.channel, event.user);
      await runPhotoSlides({
        client,
        parsed: { thread, presentationId, slideNumber },
        reply
      });
    } catch (error) {
      clearPendingPhotoSlides(event.channel, event.user);
      logger.error(`Failed to handle /photoslides setup message: ${getSafeErrorMessage(error)}`);
      await reply("Sorry, I could not update the photo slide. Check the bot logs for details.");
    }
  });
};

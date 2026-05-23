import type { WebClient } from "@slack/web-api";

import { getRecord, getStoreDisplayPath, upsertRecord } from "./blackmail-store.js";
import { getSlackUserProfile } from "./slack-user.js";
import type { BlackmailRecord } from "../types/blackmail.js";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

export const resolvePhotoUrl = async (client: WebClient, fileId: string): Promise<string | null> => {
  const result = await client.files.info({ file: fileId });
  const file = result.file;

  return file?.permalink ?? file?.url_private ?? file?.permalink_public ?? null;
};

export type UploadPhotoResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export const saveUploadFromFile = async (
  client: WebClient,
  userId: string,
  fileId: string
): Promise<UploadPhotoResult> => {
  const [{ name, role }, photoUrl] = await Promise.all([
    getSlackUserProfile(client, userId),
    resolvePhotoUrl(client, fileId)
  ]);

  if (!photoUrl) {
    return {
      ok: false,
      message: "Could not read that file. Try sending the image again."
    };
  }

  const existing = await getRecord(userId);
  const now = new Date().toISOString();

  const record: BlackmailRecord = {
    slackUserId: userId,
    name,
    role,
    dateUploaded: now,
    blackmailPhoto: photoUrl,
    dateReleased: existing?.dateReleased ?? null
  };

  await upsertRecord(record);

  const roleNote = role === "—" ? "\n_Set your job title in Slack if you want it on the tracker._" : "";
  const headline = existing?.dateUploaded ? "Photo updated" : "Upload successful";

  return {
    ok: true,
    message: [
      `✅ *${headline}!*`,
      "",
      `*${name}* · ${role}`,
      `Uploaded: ${formatDate(now)}`,
      "",
      `Stored in \`${getStoreDisplayPath()}\` on the bot server.`,
      roleNote
    ]
      .filter(Boolean)
      .join("\n")
  };
};

import type { WebClient } from "@slack/web-api";

export type ThreadReference = {
  channelId: string;
  threadTs: string;
};

export type ParsedPhotoSlidesCommand = {
  thread: ThreadReference;
  presentationId: string;
  slideNumber: number;
};

export type SlackThreadPhoto = {
  fileId: string;
  name: string;
  mimeType: string;
  data: Buffer;
};

export type SkippedSlackFile = {
  name: string;
  reason: string;
};

type SlackThreadFile = {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  url_private?: string;
  url_private_download?: string;
};

type SlackThreadMessage = {
  files?: SlackThreadFile[];
};

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const SUPPORTED_FILE_TYPES = new Set(["png", "jpg", "jpeg", "gif"]);

export const parsePositiveInteger = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeSlackTsFromPermalink = (value: string): string | null => {
  const digits = value.match(/^p(\d{10})(\d{6})$/);

  if (!digits) {
    return null;
  }

  return `${digits[1]}.${digits[2]}`;
};

const normalizeSlackTs = (value: string): string | null => {
  const trimmed = value.trim();

  if (/^\d{10}\.\d{6}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{16}$/.test(trimmed)) {
    return `${trimmed.slice(0, 10)}.${trimmed.slice(10)}`;
  }

  return normalizeSlackTsFromPermalink(trimmed);
};

const unwrapSlackLink = (value: string): string => {
  const trimmed = value.trim();
  const match = trimmed.match(/^<([^>|]+)(?:\|[^>]+)?>$/);
  return match?.[1] ?? trimmed;
};

export const parseGoogleSlidesPresentationId = (value: string): string | null => {
  const rawValue = unwrapSlackLink(value);

  try {
    const url = new URL(rawValue);
    return url.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1] ?? null;
  } catch {
    return /^[a-zA-Z0-9_-]{20,}$/.test(rawValue) ? rawValue : null;
  }
};

export const parseThreadReference = (value: string, fallbackChannelId: string): ThreadReference | null => {
  const rawLink = unwrapSlackLink(value);
  let url: URL;

  try {
    url = new URL(rawLink);
  } catch {
    return null;
  }

  const channelId = url.pathname.match(/\/archives\/([^/]+)/)?.[1] ?? url.searchParams.get("cid") ?? fallbackChannelId;
  const queryThreadTs = url.searchParams.get("thread_ts");
  const permalinkTs = url.pathname
    .split("/")
    .find((part) => part.startsWith("p"));

  const threadTs = queryThreadTs ?? (permalinkTs ? normalizeSlackTsFromPermalink(permalinkTs) : null);

  if (!channelId || !threadTs) {
    return null;
  }

  return { channelId, threadTs };
};

export const parsePhotoSlidesCommand = (
  text: string,
  fallbackChannelId: string
): ParsedPhotoSlidesCommand | null => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const slideTokenIndex = tokens.findIndex((token) => /^slide=\d+$/i.test(token));
  let slideNumber: number | null = null;

  if (slideTokenIndex >= 0) {
    slideNumber = parsePositiveInteger(tokens[slideTokenIndex].split("=")[1]);
    tokens.splice(slideTokenIndex, 1);
  } else if (tokens.length >= 3) {
    const numericSlideNumber = parsePositiveInteger(tokens[tokens.length - 1]);

    if (numericSlideNumber) {
      slideNumber = numericSlideNumber;
      tokens.pop();
    }
  }

  const presentationTokenIndex = tokens.findIndex((token) => /^(?:deck|slides|presentation)=/i.test(token));
  const presentationInput =
    presentationTokenIndex >= 0 ? tokens[presentationTokenIndex].replace(/^(?:deck|slides|presentation)=/i, "") : tokens[1];

  if (presentationTokenIndex >= 0) {
    tokens.splice(presentationTokenIndex, 1);
  }

  const threadInput = tokens[0];
  const presentationId = presentationInput ? parseGoogleSlidesPresentationId(presentationInput) : null;

  if (!threadInput || !presentationId || !slideNumber) {
    return null;
  }

  const linkedThread = parseThreadReference(threadInput, fallbackChannelId);

  if (linkedThread) {
    return { thread: linkedThread, presentationId, slideNumber };
  }

  const threadTs = normalizeSlackTs(threadInput);

  if (!threadTs) {
    return null;
  }

  return {
    thread: {
      channelId: fallbackChannelId,
      threadTs
    },
    presentationId,
    slideNumber
  };
};

const getFileName = (file: SlackThreadFile): string => {
  return file.name ?? file.title ?? file.id ?? "Slack image";
};

const isSupportedImage = (file: SlackThreadFile): boolean => {
  if (file.mimetype && SUPPORTED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return true;
  }

  return SUPPORTED_FILE_TYPES.has((file.filetype ?? "").toLowerCase());
};

const collectFileIds = (messages: SlackThreadMessage[]): string[] => {
  const seen = new Set<string>();
  const fileIds: string[] = [];

  for (const message of messages) {
    for (const file of message.files ?? []) {
      if (!file.id || seen.has(file.id)) {
        continue;
      }

      seen.add(file.id);
      fileIds.push(file.id);
    }
  }

  return fileIds;
};

const getThreadMessages = async (
  client: WebClient,
  channelId: string,
  threadTs: string
): Promise<SlackThreadMessage[]> => {
  const messages: SlackThreadMessage[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 200,
      cursor
    });

    messages.push(...((result.messages ?? []) as SlackThreadMessage[]));
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return messages;
};

const downloadSlackFile = async (token: string, file: SlackThreadFile): Promise<Buffer> => {
  const url = file.url_private_download ?? file.url_private;

  if (!url) {
    throw new Error(`Slack file ${getFileName(file)} does not include a downloadable URL.`);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${getFileName(file)} from Slack: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

export const getSlackThreadPhotos = async (
  client: WebClient,
  botToken: string,
  thread: ThreadReference
): Promise<{ photos: SlackThreadPhoto[]; skipped: SkippedSlackFile[] }> => {
  const messages = await getThreadMessages(client, thread.channelId, thread.threadTs);
  const fileIds = collectFileIds(messages);
  const photos: SlackThreadPhoto[] = [];
  const skipped: SkippedSlackFile[] = [];

  for (const fileId of fileIds) {
    let result;

    try {
      result = await client.files.info({ file: fileId });
    } catch (error) {
      skipped.push({
        name: fileId,
        reason: error instanceof Error ? error.message : "Could not read Slack file metadata."
      });
      continue;
    }

    const file = result.file as SlackThreadFile | undefined;

    if (!file) {
      skipped.push({ name: fileId, reason: "Slack did not return file metadata." });
      continue;
    }

    const name = getFileName(file);

    if (!isSupportedImage(file)) {
      skipped.push({
        name,
        reason: `Unsupported file type${file.mimetype ? ` (${file.mimetype})` : ""}.`
      });
      continue;
    }

    const mimeType =
      file.mimetype ??
      (["jpg", "jpeg"].includes((file.filetype ?? "").toLowerCase()) ? "image/jpeg" : `image/${file.filetype}`);

    try {
      photos.push({
        fileId,
        name,
        mimeType,
        data: await downloadSlackFile(botToken, file)
      });
    } catch (error) {
      skipped.push({
        name,
        reason: error instanceof Error ? error.message : "Could not download Slack file."
      });
    }
  }

  return { photos, skipped };
};

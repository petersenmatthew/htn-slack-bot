import fs from "node:fs/promises";
import path from "node:path";

import type { BlackmailRecord, BlackmailStoreData } from "../types/blackmail.js";

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(STORE_DIR, "blackmail.json");
const STORE_DISPLAY_PATH = "data/blackmail.json";

/** Human-readable path shown in Slack after uploads. */
export const getStoreDisplayPath = (): string => STORE_DISPLAY_PATH;

const emptyStore = (): BlackmailStoreData => ({ records: {} });

const readStore = async (): Promise<BlackmailStoreData> => {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as BlackmailStoreData;

    if (!parsed.records || typeof parsed.records !== "object") {
      return emptyStore();
    }

    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyStore();
    }

    throw error;
  }
};

const writeStore = async (data: BlackmailStoreData): Promise<void> => {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const getRecord = async (slackUserId: string): Promise<BlackmailRecord | null> => {
  const store = await readStore();
  return store.records[slackUserId] ?? null;
};

export const listRecords = async (): Promise<BlackmailRecord[]> => {
  const store = await readStore();
  return Object.values(store.records).sort((a, b) => a.name.localeCompare(b.name));
};

export const upsertRecord = async (record: BlackmailRecord): Promise<BlackmailRecord> => {
  const store = await readStore();
  store.records[record.slackUserId] = record;
  await writeStore(store);
  return record;
};

export const setReleased = async (
  slackUserId: string,
  dateReleased: string
): Promise<BlackmailRecord | null> => {
  const store = await readStore();
  const existing = store.records[slackUserId];

  if (!existing) {
    return null;
  }

  const updated: BlackmailRecord = { ...existing, dateReleased };
  store.records[slackUserId] = updated;
  await writeStore(store);
  return updated;
};

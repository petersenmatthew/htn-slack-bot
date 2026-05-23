import fs from "node:fs/promises";
import path from "node:path";

import type { Vote, VoteStoreData } from "../types/votes.js";

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(STORE_DIR, "votes.json");

const emptyStore = (): VoteStoreData => ({ votes: [] });

const readStore = async (): Promise<VoteStoreData> => {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as VoteStoreData;

    if (!Array.isArray(parsed.votes)) {
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

const writeStore = async (data: VoteStoreData): Promise<void> => {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const addVote = async (vote: Vote): Promise<Vote> => {
  const store = await readStore();
  store.votes.push(vote);
  await writeStore(store);
  return vote;
};

export const listVotes = async (): Promise<Vote[]> => {
  const store = await readStore();
  return store.votes;
};

export const listVotesForUser = async (slackUserId: string): Promise<Vote[]> => {
  const store = await readStore();
  return store.votes.filter((v) => v.votedForUserId === slackUserId);
};

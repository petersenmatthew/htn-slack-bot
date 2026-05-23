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

/**
 * Return the user with the most votes. Ties go to the first user who reached
 * the highest count (earliest vote timestamp).
 */
export const getTopVotedUser = async (): Promise<{ userId: string; name: string; voteCount: number } | null> => {
  const store = await readStore();

  if (store.votes.length === 0) {
    return null;
  }

  const tallies = new Map<string, { name: string; count: number }>();

  for (const vote of store.votes) {
    const existing = tallies.get(vote.votedForUserId);

    if (existing) {
      existing.count += 1;
    } else {
      tallies.set(vote.votedForUserId, { name: vote.votedForName, count: 1 });
    }
  }

  let topUserId = "";
  let topName = "";
  let topCount = 0;

  for (const [userId, { name, count }] of tallies.entries()) {
    if (count > topCount) {
      topUserId = userId;
      topName = name;
      topCount = count;
    }
  }

  return { userId: topUserId, name: topName, voteCount: topCount };
};

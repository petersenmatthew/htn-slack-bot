export type Vote = {
  id: string;
  votedForUserId: string;
  votedForName: string;
  votedByUserId: string;
  votedByName: string;
  reason: string;
  timestamp: string; // ISO 8601
};

export type VoteStoreData = {
  votes: Vote[];
};

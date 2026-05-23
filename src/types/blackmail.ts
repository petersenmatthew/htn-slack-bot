/** One team member's embarrassing-photo record for the year. */
export type BlackmailRecord = {
  slackUserId: string;
  name: string;
  role: string;
  dateUploaded: string | null;
  blackmailPhoto: string | null;
  dateReleased: string | null;
};

export type BlackmailStoreData = {
  records: Record<string, BlackmailRecord>;
};

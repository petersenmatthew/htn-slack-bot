type PendingBlackmailSession = {
  channelId: string;
  userId: string;
  step: "presentation";
  expiresAt: number;
};

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, PendingBlackmailSession>();

const getKey = (channelId: string, userId: string): string => `${channelId}:${userId}`;

const pruneExpiredSessions = (): void => {
  const now = Date.now();

  for (const [key, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(key);
    }
  }
};

export const startPendingBlackmail = (channelId: string, userId: string): PendingBlackmailSession => {
  pruneExpiredSessions();

  const session: PendingBlackmailSession = {
    channelId,
    userId,
    step: "presentation",
    expiresAt: Date.now() + SESSION_TTL_MS
  };

  sessions.set(getKey(channelId, userId), session);
  return session;
};

export const getPendingBlackmail = (
  channelId: string,
  userId: string
): PendingBlackmailSession | null => {
  pruneExpiredSessions();
  return sessions.get(getKey(channelId, userId)) ?? null;
};

export const clearPendingBlackmail = (channelId: string, userId: string): void => {
  sessions.delete(getKey(channelId, userId));
};

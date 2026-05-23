type PhotoSlidesStep = "thread" | "presentation" | "slide";

type PendingPhotoSlidesSession = {
  channelId: string;
  userId: string;
  step: PhotoSlidesStep;
  threadInput?: string;
  presentationInput?: string;
  expiresAt: number;
};

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, PendingPhotoSlidesSession>();

const getKey = (channelId: string, userId: string): string => `${channelId}:${userId}`;

const pruneExpiredSessions = (): void => {
  const now = Date.now();

  for (const [key, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(key);
    }
  }
};

export const startPendingPhotoSlides = (channelId: string, userId: string): PendingPhotoSlidesSession => {
  pruneExpiredSessions();

  const session: PendingPhotoSlidesSession = {
    channelId,
    userId,
    step: "thread",
    expiresAt: Date.now() + SESSION_TTL_MS
  };

  sessions.set(getKey(channelId, userId), session);
  return session;
};

export const getPendingPhotoSlides = (
  channelId: string,
  userId: string
): PendingPhotoSlidesSession | null => {
  pruneExpiredSessions();
  return sessions.get(getKey(channelId, userId)) ?? null;
};

export const updatePendingPhotoSlides = (session: PendingPhotoSlidesSession): void => {
  sessions.set(getKey(session.channelId, session.userId), {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
};

export const clearPendingPhotoSlides = (channelId: string, userId: string): void => {
  sessions.delete(getKey(channelId, userId));
};

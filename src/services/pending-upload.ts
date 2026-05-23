const PENDING_TTL_MS = 15 * 60 * 1000;

const pendingByUser = new Map<string, number>();

export const markPendingUpload = (userId: string): void => {
  pendingByUser.set(userId, Date.now() + PENDING_TTL_MS);
};

export const hasPendingUpload = (userId: string): boolean => {
  const expiresAt = pendingByUser.get(userId);

  if (!expiresAt) {
    return false;
  }

  if (Date.now() > expiresAt) {
    pendingByUser.delete(userId);
    return false;
  }

  return true;
};

export const clearPendingUpload = (userId: string): void => {
  pendingByUser.delete(userId);
};

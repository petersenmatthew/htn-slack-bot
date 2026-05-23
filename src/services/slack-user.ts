import type { WebClient } from "@slack/web-api";

export type SlackUserProfile = {
  name: string;
  role: string;
};

const DEFAULT_ROLE = "—";

export const getSlackUserProfile = async (
  client: WebClient,
  userId: string
): Promise<SlackUserProfile> => {
  const result = await client.users.info({ user: userId });
  const user = result.user;

  if (!user) {
    return { name: userId, role: DEFAULT_ROLE };
  }

  const name = user.real_name ?? user.profile?.display_name ?? user.name ?? userId;
  const role = user.profile?.title?.trim() || DEFAULT_ROLE;

  return { name, role };
};

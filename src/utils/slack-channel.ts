/** Slack DM channel IDs start with `D` (public/private channels use `C` / `G`). */
export const isDirectMessageChannel = (channelId: string): boolean => channelId.startsWith("D");

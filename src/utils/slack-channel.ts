/** Slack DM channel IDs start with `D` (public/private channels use `C` / `G`). */
export const isDirectMessageChannel = (channelId: string): boolean => channelId.startsWith("D");

/** True for 1:1 DMs with the bot (`channel_type: im` or `D…` channel id). */
export const isBotDirectMessage = (channelId: string, channelType?: string): boolean =>
  channelType === "im" || isDirectMessageChannel(channelId);

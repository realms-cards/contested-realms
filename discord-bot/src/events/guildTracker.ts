/**
 * Tracks which Discord servers (guilds) have invited the bot.
 * Posts a summary on startup and join/leave events to the realms.cards status channel.
 */

import { Client, Guild, TextChannel } from "discord.js";

const STATUS_GUILD_ID = "1226910297877385268";
const STATUS_CHANNEL_ID = "1493661436826615998";

async function getStatusChannel(client: Client): Promise<TextChannel | null> {
  try {
    const guild = await client.guilds.fetch(STATUS_GUILD_ID);
    const channel = await guild.channels.fetch(STATUS_CHANNEL_ID);
    if (channel?.isTextBased() && channel instanceof TextChannel) {
      return channel;
    }
    console.warn("[guildTracker] Status channel is not a text channel");
    return null;
  } catch (err) {
    console.error("[guildTracker] Failed to fetch status channel:", err);
    return null;
  }
}

export async function reportGuildSummary(client: Client): Promise<void> {
  const guilds = client.guilds.cache;
  const lines = guilds.map(
    (g) => `• **${g.name}** (id: \`${g.id}\`, members: ${g.memberCount})`
  );
  const message =
    `🤖 Bot online — active in **${guilds.size}** server(s):\n` +
    lines.join("\n");

  console.log(`[guildTracker] ${message.replace(/\*\*/g, "")}`);

  const channel = await getStatusChannel(client);
  if (channel) {
    await channel.send(message);
  }
}

export async function reportGuildJoin(guild: Guild): Promise<void> {
  const message = `✅ Bot added to **${guild.name}** (id: \`${guild.id}\`, members: ${guild.memberCount})`;
  console.log(`[guildTracker] ${message.replace(/\*\*/g, "")}`);

  const channel = await getStatusChannel(guild.client);
  if (channel) {
    await channel.send(message);
  }
}

export async function reportGuildLeave(guild: Guild): Promise<void> {
  const message = `🚪 Bot removed from **${guild.name}** (id: \`${guild.id}\`)`;
  console.log(`[guildTracker] ${message.replace(/\*\*/g, "")}`);

  const channel = await getStatusChannel(guild.client);
  if (channel) {
    await channel.send(message);
  }
}

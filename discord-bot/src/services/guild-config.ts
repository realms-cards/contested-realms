/**
 * Per-guild "looking for a game" configuration, stored in Redis so server
 * admins can set it with /lfg-config without a redeploy.
 *
 * Key layout:
 *   realms:discord:lfg-config           -> Set of configured guild ids
 *   realms:discord:lfg-config:<guildId> -> Hash { channelId, roleId }
 */

import { getSharedRedis } from "./redis.js";

const INDEX_KEY = "realms:discord:lfg-config";

export interface GuildLfgConfig {
  guildId: string;
  channelId: string;
  roleId: string;
}

function configKey(guildId: string): string {
  return `${INDEX_KEY}:${guildId}`;
}

export async function setGuildLfgConfig(
  config: GuildLfgConfig,
): Promise<void> {
  const redis = getSharedRedis();
  await redis
    .multi()
    .hset(configKey(config.guildId), {
      channelId: config.channelId,
      roleId: config.roleId,
    })
    .sadd(INDEX_KEY, config.guildId)
    .exec();
}

export async function getGuildLfgConfig(
  guildId: string,
): Promise<GuildLfgConfig | null> {
  const redis = getSharedRedis();
  try {
    const data = await redis.hgetall(configKey(guildId));
    if (!data?.channelId || !data?.roleId) return null;
    return { guildId, channelId: data.channelId, roleId: data.roleId };
  } catch (err) {
    console.error(`[guild-config] Failed to read config for ${guildId}:`, err);
    return null;
  }
}

export async function clearGuildLfgConfig(guildId: string): Promise<boolean> {
  const redis = getSharedRedis();
  const removed = await redis.del(configKey(guildId));
  await redis.srem(INDEX_KEY, guildId);
  return removed > 0;
}

/**
 * Every guild with an announcement channel configured.
 */
export async function listGuildLfgConfigs(): Promise<GuildLfgConfig[]> {
  const redis = getSharedRedis();
  try {
    const guildIds = await redis.smembers(INDEX_KEY);
    const configs = await Promise.all(
      guildIds.map((guildId) => getGuildLfgConfig(guildId)),
    );
    return configs.filter((config): config is GuildLfgConfig => config !== null);
  } catch (err) {
    console.error("[guild-config] Failed to list configs:", err);
    return [];
  }
}

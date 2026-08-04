/**
 * Announces "player is looking for a match" events to Discord.
 *
 * The socket server publishes these on the `discord:notify` Redis channel
 * whenever someone joins the constructed queue (from Discord *or* the web) or
 * opens a public lobby on the site. For every guild that configured a channel
 * with /lfg-config, the bot pings that guild's Duelist role.
 */

import type { Client, Guild, TextChannel } from "discord.js";
import type { Redis } from "ioredis";
import { z } from "zod";
import { listGuildLfgConfigs } from "./guild-config.js";
import type { RealmsApiClient } from "./realms-api.js";
import { createRedisClient } from "./redis.js";

const NOTIFY_CHANNEL = "discord:notify";

/** Don't ping for the same player more than once in this window. */
const PLAYER_COOLDOWN_MS = 15 * 60 * 1000;
/** Ignore events the server published before the bot came up. */
const MAX_EVENT_AGE_MS = 60 * 1000;

const LfgEventSchema = z.object({
  kind: z.enum(["queue", "lobby"]),
  playerId: z.string(),
  playerName: z.string().nullable().optional(),
  source: z.enum(["web", "discord"]).optional(),
  discordId: z.string().nullable().optional(),
  lobbyId: z.string().optional(),
  lobbyName: z.string().nullable().optional(),
  matchType: z.string().optional(),
  queueSize: z.number().optional(),
  at: z.number(),
});

type LfgEvent = z.infer<typeof LfgEventSchema>;

function formatMatchType(matchType: string | undefined): string {
  if (!matchType) return "Constructed";
  return matchType.charAt(0).toUpperCase() + matchType.slice(1);
}

export class LfgAnnouncer {
  private client: Client;
  private realmsApi: RealmsApiClient;
  private subscriber: Redis | null = null;
  private lastAnnouncedByPlayer = new Map<string, number>();

  constructor(client: Client, realmsApi: RealmsApiClient) {
    this.client = client;
    this.realmsApi = realmsApi;
  }

  start(): void {
    if (this.subscriber) return;

    const subscriber = createRedisClient("lfg-announcer");
    this.subscriber = subscriber;

    subscriber.subscribe(NOTIFY_CHANNEL, (err) => {
      if (err) {
        console.error("[lfg-announcer] Failed to subscribe:", err.message);
        return;
      }
      console.log(`[lfg-announcer] Subscribed to ${NOTIFY_CHANNEL}`);
    });

    subscriber.on("message", (channel, raw) => {
      if (channel !== NOTIFY_CHANNEL) return;
      this.handleMessage(raw).catch((err) => {
        console.error("[lfg-announcer] Failed to handle event:", err);
      });
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[lfg-announcer] Ignoring non-JSON payload");
      return;
    }

    const result = LfgEventSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("[lfg-announcer] Ignoring malformed event:", result.error.message);
      return;
    }

    const event = result.data;

    // A backlog replayed on reconnect would ping about players who have long
    // since found a game.
    if (Date.now() - event.at > MAX_EVENT_AGE_MS) return;

    if (this.isOnCooldown(event.playerId)) return;

    const configs = await listGuildLfgConfigs();
    if (configs.length === 0) return;

    this.lastAnnouncedByPlayer.set(event.playerId, Date.now());
    this.pruneCooldowns();

    for (const config of configs) {
      await this.announceToGuild(config.guildId, config.channelId, config.roleId, event);
    }
  }

  private isOnCooldown(playerId: string): boolean {
    const last = this.lastAnnouncedByPlayer.get(playerId);
    return typeof last === "number" && Date.now() - last < PLAYER_COOLDOWN_MS;
  }

  private pruneCooldowns(): void {
    const cutoff = Date.now() - PLAYER_COOLDOWN_MS;
    for (const [playerId, at] of this.lastAnnouncedByPlayer) {
      if (at < cutoff) this.lastAnnouncedByPlayer.delete(playerId);
    }
  }

  private buildMessage(roleId: string, event: LfgEvent): string {
    const name = event.playerName || "A player";
    const format = formatMatchType(event.matchType);

    if (event.kind === "lobby" && event.lobbyId) {
      const joinUrl = this.realmsApi.buildLobbyUrl(event.lobbyId);
      const lobbyName = event.lobbyName ? ` — "${event.lobbyName}"` : "";
      return (
        `⚔️ <@&${roleId}> — **${name}** opened a public ${format.toLowerCase()} lobby${lobbyName}.\n` +
        `Join them: ${joinUrl}`
      );
    }

    const queueUrl = this.realmsApi.buildSiteUrl("/online/lobby");
    return (
      `⚔️ <@&${roleId}> — **${name}** is looking for a ${format.toLowerCase()} match!\n` +
      `Use \`/queue join\` or hop in on the site: ${queueUrl}`
    );
  }

  private async announceToGuild(
    guildId: string,
    channelId: string,
    roleId: string,
    event: LfgEvent,
  ): Promise<void> {
    let guild: Guild;
    try {
      guild = await this.client.guilds.fetch(guildId);
    } catch {
      // Bot was removed from the guild — leave the config in place in case it
      // is re-invited.
      return;
    }

    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      console.warn(
        `[lfg-announcer] Role ${roleId} missing in guild ${guildId} — reconfigure with /lfg-config`,
      );
      return;
    }

    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        console.warn(
          `[lfg-announcer] Channel ${channelId} in guild ${guildId} is not text-based`,
        );
        return;
      }

      await (channel as TextChannel).send({
        content: this.buildMessage(roleId, event),
        allowedMentions: { roles: [roleId] },
      });
    } catch (err) {
      console.error(
        `[lfg-announcer] Failed to announce in guild ${guildId}:`,
        err,
      );
    }
  }

  async cleanup(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(NOTIFY_CHANNEL).catch(() => {});
      this.subscriber = null;
    }
    this.lastAnnouncedByPlayer.clear();
  }
}

/**
 * Manages the matchmaking queue for constructed matches.
 * Uses Redis for persistent queue state with in-memory fallback.
 *
 * Matching priority:
 *  1. Same-guild pair — matched immediately on join
 *  2. Any same-guild pair in the full queue
 *  3. Cross-server fallback after CROSS_SERVER_GRACE_MS (2 min)
 */

import type { Client, TextChannel } from "discord.js";
import { Redis } from "ioredis";
import type { ChallengeManager } from "./challenge-manager.js";
import type { RealmsApiClient, MatchCreated } from "./realms-api.js";
import type { VoiceCoordinator } from "./voice-coordinator.js";

const QUEUE_KEY = "realms:queue:constructed";
const QUEUE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds
const CROSS_SERVER_GRACE_MS = 2 * 60 * 1000; // 2 minutes
const PERIODIC_MATCH_CHECK_MS = 10 * 1000; // 10 seconds

export interface QueueEntry {
  discordId: string;
  guildId: string;
  channelId: string;
  joinedAt: number;
}

export interface JoinQueueResult {
  status: "queued" | "matched" | "already_in_queue" | "not_linked";
  position?: number;
  queueSize?: number;
  match?: MatchCreated;
  wasEmpty?: boolean;
}

export interface MatchResult {
  match: MatchCreated;
  player1: QueueEntry;
  player2: QueueEntry;
  voiceInvite?: string;
}

export class QueueManager {
  private redis: Redis | null = null;
  private fallbackQueue: Map<string, QueueEntry> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private matchCheckTimer: NodeJS.Timeout | null = null;
  private client: Client;
  private realmsApi: RealmsApiClient;
  private challengeManager: ChallengeManager;
  private voiceCoordinator: VoiceCoordinator;

  constructor(
    client: Client,
    realmsApi: RealmsApiClient,
    challengeManager: ChallengeManager,
    voiceCoordinator: VoiceCoordinator,
  ) {
    this.client = client;
    this.realmsApi = realmsApi;
    this.challengeManager = challengeManager;
    this.voiceCoordinator = voiceCoordinator;

    this.initRedis();
    this.startCleanupTask();
    this.startPeriodicMatchCheck();
  }

  private initRedis(): void {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    try {
      // Parse Redis URL to extract password if present (same pattern as leader-lock.ts)
      let redisOptions:
        | { host: string; port: number; password?: string }
        | undefined;
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.password) {
          redisOptions = {
            host: parsedUrl.hostname,
            port: parseInt(parsedUrl.port || "6379"),
            password: parsedUrl.password,
          };
        }
      } catch {
        console.warn("[queue-manager] Failed to parse REDIS_URL, using as-is");
      }

      if (redisOptions) {
        this.redis = new Redis({
          ...redisOptions,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 5) {
              console.error(
                "[queue-manager] Redis connection failed after 5 retries",
              );
              return null;
            }
            return Math.min(times * 200, 3000);
          },
          lazyConnect: false,
        });
      } else {
        this.redis = new Redis(url, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 5) {
              console.error(
                "[queue-manager] Redis connection failed after 5 retries",
              );
              return null;
            }
            return Math.min(times * 200, 3000);
          },
          lazyConnect: false,
        });
      }

      this.redis.on("connect", () => {
        console.log("[queue-manager] Redis connected");
      });

      this.redis.on("error", (err: Error) => {
        console.error("[queue-manager] Redis error:", err.message);
      });
    } catch (err) {
      console.error("[queue-manager] Failed to initialize Redis:", err);
      console.warn("[queue-manager] Using in-memory fallback queue");
    }
  }

  private startCleanupTask(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries().catch((err) => {
        console.error("[queue-manager] Cleanup task failed:", err);
      });
    }, CLEANUP_INTERVAL_MS);
  }

  private startPeriodicMatchCheck(): void {
    this.matchCheckTimer = setInterval(() => {
      this.periodicMatchCheck().catch((err) => {
        console.error("[queue-manager] Periodic match check failed:", err);
      });
    }, PERIODIC_MATCH_CHECK_MS);
  }

  /**
   * Periodic check for cross-server matches once grace period expires.
   */
  private async periodicMatchCheck(): Promise<void> {
    const pair = await this.findMatch();
    if (pair) {
      await this.executeMatch(pair[0], pair[1]);
    }
  }

  /**
   * Join the constructed matchmaking queue.
   */
  async joinQueue(
    discordId: string,
    guildId: string,
    channelId: string,
  ): Promise<JoinQueueResult> {
    // Check if user has linked account
    const user = await this.realmsApi.getUserByDiscordId(discordId);
    if (!user) {
      return { status: "not_linked" };
    }

    // Check if already in queue
    const existingPosition = await this.getPlayerPosition(discordId);
    if (existingPosition !== null) {
      const queueSize = await this.getQueueSize();
      return {
        status: "already_in_queue",
        position: existingPosition,
        queueSize,
      };
    }

    // Get current queue size before adding
    const queueSizeBefore = await this.getQueueSize();
    const wasEmpty = queueSizeBefore === 0;

    // Add to queue
    const entry: QueueEntry = {
      discordId,
      guildId,
      channelId,
      joinedAt: Date.now(),
    };

    await this.addToQueue(entry);

    // Check for match (same-guild preference)
    const pair = await this.findMatch(entry);
    if (pair) {
      const matchResult = await this.executeMatch(pair[0], pair[1]);
      if (matchResult) {
        return {
          status: "matched",
          match: matchResult.match,
        };
      }
    }

    // Not matched yet - return queue position
    const position = await this.getPlayerPosition(discordId);
    const queueSize = await this.getQueueSize();

    return {
      status: "queued",
      position: position ?? 1,
      queueSize,
      wasEmpty,
    };
  }

  /**
   * Leave the queue.
   */
  async leaveQueue(discordId: string): Promise<boolean> {
    if (this.redis) {
      try {
        const entries = await this.redis.zrange(QUEUE_KEY, 0, -1);
        for (const entryJson of entries) {
          const entry = JSON.parse(entryJson) as QueueEntry;
          if (entry.discordId === discordId) {
            await this.redis.zrem(QUEUE_KEY, entryJson);
            console.log(`[queue-manager] Removed ${discordId} from queue`);
            return true;
          }
        }
        return false;
      } catch (err) {
        console.error("[queue-manager] Redis leaveQueue failed:", err);
      }
    }

    const existed = this.fallbackQueue.has(discordId);
    this.fallbackQueue.delete(discordId);
    return existed;
  }

  /**
   * Get current queue size (all guilds).
   */
  async getQueueSize(): Promise<number> {
    if (this.redis) {
      try {
        return await this.redis.zcard(QUEUE_KEY);
      } catch (err) {
        console.error("[queue-manager] Redis getQueueSize failed:", err);
      }
    }
    return this.fallbackQueue.size;
  }

  /**
   * Get queue size for a specific guild.
   */
  async getGuildQueueSize(guildId: string): Promise<number> {
    const entries = await this.getAllEntries();
    return entries.filter((e) => e.guildId === guildId).length;
  }

  /**
   * Get player's position in queue (1-indexed), or null if not in queue.
   */
  async getPlayerPosition(discordId: string): Promise<number | null> {
    if (this.redis) {
      try {
        const entries = await this.redis.zrange(QUEUE_KEY, 0, -1);
        for (let i = 0; i < entries.length; i++) {
          const entry = JSON.parse(entries[i]) as QueueEntry;
          if (entry.discordId === discordId) {
            return i + 1;
          }
        }
        return null;
      } catch (err) {
        console.error("[queue-manager] Redis getPlayerPosition failed:", err);
      }
    }

    const entries = Array.from(this.fallbackQueue.entries()).sort(
      (a, b) => a[1].joinedAt - b[1].joinedAt,
    );

    for (let i = 0; i < entries.length; i++) {
      if (entries[i][0] === discordId) {
        return i + 1;
      }
    }
    return null;
  }

  /**
   * Get all queue entries sorted by joinedAt (oldest first).
   */
  private async getAllEntries(): Promise<QueueEntry[]> {
    if (this.redis) {
      try {
        const entries = await this.redis.zrange(QUEUE_KEY, 0, -1);
        return entries.map((e) => JSON.parse(e) as QueueEntry);
      } catch (err) {
        console.error("[queue-manager] Redis getAllEntries failed:", err);
      }
    }
    return Array.from(this.fallbackQueue.values()).sort(
      (a, b) => a.joinedAt - b.joinedAt,
    );
  }

  /**
   * Find a pair to match using same-guild preference then cross-server fallback.
   *
   * Strategy:
   *  1. If newEntry provided: find oldest same-guild opponent for this player
   *  2. Find any same-guild pair in the full queue
   *  3. Cross-server fallback: if oldest entry waited ≥ CROSS_SERVER_GRACE_MS, match top 2
   */
  private async findMatch(
    newEntry?: QueueEntry,
  ): Promise<[QueueEntry, QueueEntry] | null> {
    const entries = await this.getAllEntries();
    if (entries.length < 2) return null;

    // Strategy 1: same-guild match for the new joiner
    if (newEntry) {
      const sameGuildOpponent = entries.find(
        (e) =>
          e.guildId === newEntry.guildId &&
          e.discordId !== newEntry.discordId,
      );
      if (sameGuildOpponent) {
        // Return oldest of the two as player1
        return sameGuildOpponent.joinedAt < newEntry.joinedAt
          ? [sameGuildOpponent, newEntry]
          : [newEntry, sameGuildOpponent];
      }
    }

    // Strategy 2: any same-guild pair in the full queue
    const guildBuckets = new Map<string, QueueEntry[]>();
    for (const entry of entries) {
      const bucket = guildBuckets.get(entry.guildId) ?? [];
      bucket.push(entry);
      guildBuckets.set(entry.guildId, bucket);
    }
    for (const bucket of guildBuckets.values()) {
      if (bucket.length >= 2) {
        return [bucket[0], bucket[1]];
      }
    }

    // Strategy 3: cross-server fallback once oldest player has waited long enough
    const now = Date.now();
    if (now - entries[0].joinedAt >= CROSS_SERVER_GRACE_MS) {
      return [entries[0], entries[1]];
    }

    return null;
  }

  /**
   * Find a common guild where both Discord users are members.
   * Returns the guild ID or null if none found.
   */
  private async findCommonGuild(
    discordId1: string,
    discordId2: string,
  ): Promise<string | null> {
    for (const guild of this.client.guilds.cache.values()) {
      try {
        const [m1, m2] = await Promise.all([
          guild.members.fetch(discordId1).catch(() => null),
          guild.members.fetch(discordId2).catch(() => null),
        ]);
        if (m1 && m2) return guild.id;
      } catch {
        // guild fetch failed, skip
      }
    }
    return null;
  }

  /**
   * Execute a match between two queued players.
   * Removes them from the queue, creates the challenge, voice channel, and sends DMs.
   */
  private async executeMatch(
    player1: QueueEntry,
    player2: QueueEntry,
  ): Promise<MatchResult | null> {
    // Remove both from queue
    await this.removeFromQueue(player1);
    await this.removeFromQueue(player2);

    const crossServer = player1.guildId !== player2.guildId;
    console.log(
      `[queue-manager] Matching ${player1.discordId} vs ${player2.discordId}${crossServer ? " (cross-server)" : ""}`,
    );

    try {
      // Create challenge
      const challenge = await this.challengeManager.createChallenge(
        player1.discordId,
        player2.discordId,
        "constructed",
        player1.guildId,
        player1.channelId,
      );

      // Auto-accept the challenge
      const match = await this.challengeManager.acceptChallenge(challenge.id);

      // Determine guild for voice channel
      let voiceGuildId: string | null = null;
      if (!crossServer) {
        voiceGuildId = player1.guildId;
      } else {
        voiceGuildId = await this.findCommonGuild(
          player1.discordId,
          player2.discordId,
        );
      }

      // Try to create voice channel (non-blocking)
      let voiceInvite: string | undefined;
      if (voiceGuildId) {
        try {
          const voiceInfo = await this.voiceCoordinator.requestVoiceChannel(
            match.matchId,
            match.challenger.id,
            match.challengee.id,
            voiceGuildId,
          );
          if (voiceInfo) {
            voiceInvite = voiceInfo.inviteUrl;
          }
        } catch (err) {
          console.log("[queue-manager] Voice channel creation skipped:", err);
        }
      } else if (crossServer) {
        console.log(
          "[queue-manager] No common guild found for cross-server match, skipping voice",
        );
      }

      // Send DMs to both players
      await this.sendMatchDMs(player1, player2, match, voiceInvite, crossServer);

      // Post announcements in both players' channels
      const announcementMsg = `⚔️ **Match Found!** <@${player1.discordId}> vs <@${player2.discordId}> — Constructed`;
      await this.postAnnouncement(player1.channelId, announcementMsg);
      if (player2.channelId !== player1.channelId) {
        await this.postAnnouncement(player2.channelId, announcementMsg);
      }

      return { match, player1, player2, voiceInvite };
    } catch (err) {
      console.error("[queue-manager] Match creation failed:", err);
      // Return players to queue on failure
      await this.addToQueue(player1);
      await this.addToQueue(player2);
      return null;
    }
  }

  /**
   * Send DMs to both players with their match links.
   */
  private async sendMatchDMs(
    player1: QueueEntry,
    player2: QueueEntry,
    match: MatchCreated,
    voiceInvite?: string,
    crossServer = false,
  ): Promise<void> {
    try {
      const user1 = await this.client.users.fetch(player1.discordId);
      const user2 = await this.client.users.fetch(player2.discordId);

      let message1 = `**Match Found!** Your opponent is **${match.challengee.name || "Unknown"}**\n${match.joinUrlP1}`;
      let message2 = `**Match Found!** Your opponent is **${match.challenger.name || "Unknown"}**\n${match.joinUrlP2}`;

      if (voiceInvite) {
        message1 += `\nVoice: ${voiceInvite}`;
        message2 += `\nVoice: ${voiceInvite}`;
      } else if (crossServer) {
        message1 += `\n*(Cross-server match — voice chat not available. Use in-game chat.)*`;
        message2 += `\n*(Cross-server match — voice chat not available. Use in-game chat.)*`;
      }

      await Promise.all([
        user1.send(message1).catch(() => {
          console.log(`[queue-manager] Could not DM ${player1.discordId}`);
        }),
        user2.send(message2).catch(() => {
          console.log(`[queue-manager] Could not DM ${player2.discordId}`);
        }),
      ]);
    } catch (err) {
      console.error("[queue-manager] Failed to send match DMs:", err);
    }
  }

  /**
   * Post a public announcement in the channel.
   */
  async postAnnouncement(channelId: string, message: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && "send" in channel) {
        await (channel as TextChannel).send(message);
      }
    } catch (err) {
      console.error("[queue-manager] Failed to post announcement:", err);
    }
  }

  /**
   * Add an entry to the queue.
   */
  private async addToQueue(entry: QueueEntry): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.zadd(QUEUE_KEY, entry.joinedAt, JSON.stringify(entry));
        return;
      } catch (err) {
        console.error("[queue-manager] Redis addToQueue failed:", err);
      }
    }
    this.fallbackQueue.set(entry.discordId, entry);
  }

  /**
   * Remove an entry from the queue.
   */
  private async removeFromQueue(entry: QueueEntry): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.zrem(QUEUE_KEY, JSON.stringify(entry));
        return;
      } catch (err) {
        console.error("[queue-manager] Redis removeFromQueue failed:", err);
      }
    }
    this.fallbackQueue.delete(entry.discordId);
  }

  /**
   * Remove expired entries (older than 30 minutes) and notify users.
   */
  private async cleanupExpiredEntries(): Promise<void> {
    const now = Date.now();
    const cutoff = now - QUEUE_TIMEOUT_MS;

    if (this.redis) {
      try {
        const entries = await this.redis.zrange(QUEUE_KEY, 0, -1);
        for (const entryJson of entries) {
          const entry = JSON.parse(entryJson) as QueueEntry;
          if (entry.joinedAt < cutoff) {
            await this.redis.zrem(QUEUE_KEY, entryJson);
            console.log(
              `[queue-manager] Expired ${entry.discordId} from queue`,
            );

            try {
              const user = await this.client.users.fetch(entry.discordId);
              await user.send(
                "You've been removed from the queue after 30 minutes. Use `/queue join` to queue again.",
              );
            } catch {
              // User might have DMs disabled
            }
          }
        }
        return;
      } catch (err) {
        console.error("[queue-manager] Redis cleanup failed:", err);
      }
    }

    for (const [discordId, entry] of this.fallbackQueue) {
      if (entry.joinedAt < cutoff) {
        this.fallbackQueue.delete(discordId);
        console.log(`[queue-manager] Expired ${discordId} from queue`);

        try {
          const user = await this.client.users.fetch(discordId);
          await user.send(
            "You've been removed from the queue after 30 minutes. Use `/queue join` to queue again.",
          );
        } catch {
          // User might have DMs disabled
        }
      }
    }
  }

  /**
   * Cleanup resources on shutdown.
   */
  async cleanup(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.matchCheckTimer) {
      clearInterval(this.matchCheckTimer);
      this.matchCheckTimer = null;
    }
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

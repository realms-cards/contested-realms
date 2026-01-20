/**
 * Manages the matchmaking queue for constructed matches.
 * Uses Redis for persistent queue state with in-memory fallback.
 */

import { Redis } from "ioredis";
import type { Client, TextChannel } from "discord.js";
import type { RealmsApiClient, MatchCreated } from "./realms-api.js";
import type { ChallengeManager } from "./challenge-manager.js";
import type { VoiceCoordinator } from "./voice-coordinator.js";

const QUEUE_KEY = "realms:queue:constructed";
const QUEUE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

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
  private client: Client;
  private realmsApi: RealmsApiClient;
  private challengeManager: ChallengeManager;
  private voiceCoordinator: VoiceCoordinator;

  constructor(
    client: Client,
    realmsApi: RealmsApiClient,
    challengeManager: ChallengeManager,
    voiceCoordinator: VoiceCoordinator
  ) {
    this.client = client;
    this.realmsApi = realmsApi;
    this.challengeManager = challengeManager;
    this.voiceCoordinator = voiceCoordinator;

    this.initRedis();
    this.startCleanupTask();
  }

  private initRedis(): void {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    try {
      // Parse Redis URL to extract password if present (same pattern as leader-lock.ts)
      let redisOptions: { host: string; port: number; password?: string } | undefined;
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

      // If we have parsed options (password present), use object config
      // Otherwise use URL string directly
      if (redisOptions) {
        this.redis = new Redis({
          ...redisOptions,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 5) {
              console.error("[queue-manager] Redis connection failed after 5 retries");
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
              console.error("[queue-manager] Redis connection failed after 5 retries");
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

  /**
   * Join the constructed matchmaking queue.
   */
  async joinQueue(
    discordId: string,
    guildId: string,
    channelId: string
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

    // Check for match
    const matchResult = await this.checkAndMatch();
    if (matchResult) {
      return {
        status: "matched",
        match: matchResult.match,
      };
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
        // Find and remove the entry with matching discordId
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

    // Fallback to in-memory
    const existed = this.fallbackQueue.has(discordId);
    this.fallbackQueue.delete(discordId);
    return existed;
  }

  /**
   * Get current queue size.
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
   * Get player's position in queue (1-indexed), or null if not in queue.
   */
  async getPlayerPosition(discordId: string): Promise<number | null> {
    if (this.redis) {
      try {
        const entries = await this.redis.zrange(QUEUE_KEY, 0, -1);
        for (let i = 0; i < entries.length; i++) {
          const entry = JSON.parse(entries[i]) as QueueEntry;
          if (entry.discordId === discordId) {
            return i + 1; // 1-indexed
          }
        }
        return null;
      } catch (err) {
        console.error("[queue-manager] Redis getPlayerPosition failed:", err);
      }
    }

    // Fallback to in-memory
    const entries = Array.from(this.fallbackQueue.entries())
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

    for (let i = 0; i < entries.length; i++) {
      if (entries[i][0] === discordId) {
        return i + 1;
      }
    }
    return null;
  }

  /**
   * Check if there are enough players for a match, and create one if so.
   */
  private async checkAndMatch(): Promise<MatchResult | null> {
    // Get first 2 entries from queue
    const entries = await this.getFirstNEntries(2);
    if (entries.length < 2) {
      return null;
    }

    const [player1, player2] = entries;

    // Remove both from queue
    await this.removeFromQueue(player1);
    await this.removeFromQueue(player2);

    console.log(
      `[queue-manager] Matching ${player1.discordId} vs ${player2.discordId}`
    );

    try {
      // Create challenge
      const challenge = await this.challengeManager.createChallenge(
        player1.discordId,
        player2.discordId,
        "constructed",
        player1.guildId,
        player1.channelId
      );

      // Auto-accept the challenge
      const match = await this.challengeManager.acceptChallenge(challenge.id);

      // Try to create voice channel (non-blocking)
      let voiceInvite: string | undefined;
      try {
        const voiceInfo = await this.voiceCoordinator.requestVoiceChannel(
          match.matchId,
          match.challenger.id,
          match.challengee.id
        );
        if (voiceInfo) {
          voiceInvite = voiceInfo.inviteUrl;
        }
      } catch (err) {
        console.log("[queue-manager] Voice channel creation skipped:", err);
      }

      // Send DMs to both players
      await this.sendMatchDMs(player1, player2, match, voiceInvite);

      return {
        match,
        player1,
        player2,
        voiceInvite,
      };
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
    voiceInvite?: string
  ): Promise<void> {
    try {
      const user1 = await this.client.users.fetch(player1.discordId);
      const user2 = await this.client.users.fetch(player2.discordId);

      let message1 = `**Match Found!** Your opponent is **${match.challengee.name || "Unknown"}**\n${match.joinUrlP1}`;
      let message2 = `**Match Found!** Your opponent is **${match.challenger.name || "Unknown"}**\n${match.joinUrlP2}`;

      if (voiceInvite) {
        message1 += `\nVoice: ${voiceInvite}`;
        message2 += `\nVoice: ${voiceInvite}`;
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
   * Get first N entries from queue (sorted by joinedAt).
   */
  private async getFirstNEntries(n: number): Promise<QueueEntry[]> {
    if (this.redis) {
      try {
        const entries = await this.redis.zrange(QUEUE_KEY, 0, n - 1);
        return entries.map((e) => JSON.parse(e) as QueueEntry);
      } catch (err) {
        console.error("[queue-manager] Redis getFirstNEntries failed:", err);
      }
    }

    // Fallback to in-memory
    return Array.from(this.fallbackQueue.values())
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .slice(0, n);
  }

  /**
   * Remove expired entries (older than 30 minutes) and notify users.
   */
  private async cleanupExpiredEntries(): Promise<void> {
    const now = Date.now();
    const cutoff = now - QUEUE_TIMEOUT_MS;

    if (this.redis) {
      try {
        // Get all entries
        const entries = await this.redis.zrange(QUEUE_KEY, 0, -1);
        for (const entryJson of entries) {
          const entry = JSON.parse(entryJson) as QueueEntry;
          if (entry.joinedAt < cutoff) {
            await this.redis.zrem(QUEUE_KEY, entryJson);
            console.log(`[queue-manager] Expired ${entry.discordId} from queue`);

            // Notify user via DM
            try {
              const user = await this.client.users.fetch(entry.discordId);
              await user.send(
                "You've been removed from the queue after 30 minutes. Use `/queue join` to queue again."
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

    // Fallback to in-memory
    for (const [discordId, entry] of this.fallbackQueue) {
      if (entry.joinedAt < cutoff) {
        this.fallbackQueue.delete(discordId);
        console.log(`[queue-manager] Expired ${discordId} from queue`);

        try {
          const user = await this.client.users.fetch(discordId);
          await user.send(
            "You've been removed from the queue after 30 minutes. Use `/queue join` to queue again."
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
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

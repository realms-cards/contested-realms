import type { Client, TextChannel } from "discord.js";
import type { ChallengeManager } from "./challenge-manager.js";
import type {
  QueueStatus,
  PendingQueueMatch,
  RealmsApiClient,
} from "./realms-api.js";
import type { VoiceCoordinator } from "./voice-coordinator.js";

const POLL_INTERVAL_MS = 5000;

interface ActiveDiscordQueueEntry {
  discordId: string;
  playerId: string;
  guildId: string;
  channelId: string;
}

interface QueueMatchInfo {
  lobbyId: string;
  opponentPlayerId: string;
  opponentName: string;
  joinUrl: string;
  isHost: boolean;
  status: "confirming" | "ready";
  confirmExpiresAt: number | null;
  youAccepted: boolean;
}

export interface JoinQueueResult {
  status: "queued" | "matched" | "already_in_queue" | "not_linked";
  position?: number;
  queueSize?: number;
  wasEmpty?: boolean;
  match?: QueueMatchInfo;
}

export interface QueueConfirmationResult {
  ok: boolean;
  match?: QueueMatchInfo;
}

export class QueueManager {
  private client: Client;
  private realmsApi: RealmsApiClient;
  private trackedEntries = new Map<string, ActiveDiscordQueueEntry>();
  private pollTimer: NodeJS.Timeout | null = null;
  private announcedMatches = new Set<string>();

  constructor(
    client: Client,
    realmsApi: RealmsApiClient,
    _challengeManager: ChallengeManager,
    _voiceCoordinator: VoiceCoordinator,
  ) {
    this.client = client;
    this.realmsApi = realmsApi;
    this.startPolling();
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.pollQueueStatuses().catch((err) => {
        console.error("[shared-queue-manager] Poll failed:", err);
      });
    }, POLL_INTERVAL_MS);
  }

  private async resolveMatchInfo(
    pendingMatch: PendingQueueMatch,
  ): Promise<QueueMatchInfo> {
    return {
      lobbyId: pendingMatch.lobbyId,
      opponentPlayerId: pendingMatch.opponentPlayerId,
      opponentName:
        pendingMatch.opponentPlayerName ||
        `Player ${pendingMatch.opponentPlayerId.slice(-4)}`,
      joinUrl: this.realmsApi.buildLobbyUrl(pendingMatch.lobbyId),
      isHost: pendingMatch.isHost,
      status: pendingMatch.status ?? "ready",
      confirmExpiresAt: pendingMatch.confirmExpiresAt ?? null,
      youAccepted: pendingMatch.youAccepted === true,
    };
  }

  private async notifyMatchUpdate(
    entry: ActiveDiscordQueueEntry,
    match: QueueMatchInfo,
    opts?: { skipChannelAnnouncement?: boolean },
  ): Promise<void> {
    const announcementKey = `${entry.discordId}:${match.lobbyId}:${match.status}`;
    if (this.announcedMatches.has(announcementKey)) return;
    this.announcedMatches.add(announcementKey);

    try {
      const user = await this.client.users.fetch(entry.discordId);
      await user
        .send(
          match.status === "confirming"
            ? `**Match Ready to Confirm!** Your opponent is **${match.opponentName}**\nUse \`/queue accept\` to lock it in or \`/queue decline\` to pass.${typeof match.confirmExpiresAt === "number" ? `\nExpires <t:${Math.floor(match.confirmExpiresAt / 1000)}:R>` : ""}`
            : `**Match Confirmed!** Your opponent is **${match.opponentName}**\n${match.joinUrl}`,
        )
        .catch(() => {
          console.log(`[shared-queue-manager] Could not DM ${entry.discordId}`);
        });
    } catch (err) {
      console.error("[shared-queue-manager] Failed to DM player:", err);
    }

    if (!opts?.skipChannelAnnouncement) {
      await this.postAnnouncement(
        entry.channelId,
        match.status === "confirming"
          ? `⚔️ **Match Ready to Confirm!** <@${entry.discordId}> vs **${match.opponentName}** — use \`/queue accept\` to lock it in.`
          : `⚔️ **Match Confirmed!** <@${entry.discordId}> vs **${match.opponentName}** — Constructed`,
      );
    }
  }

  private async pollQueueStatuses(): Promise<void> {
    for (const entry of this.trackedEntries.values()) {
      const status = await this.realmsApi.getConstructedQueueStatus(
        entry.playerId,
        entry.guildId,
      );
      if (status.pendingMatch) {
        const match = await this.resolveMatchInfo(status.pendingMatch);
        await this.notifyMatchUpdate(entry, match);
        if (match.status === "ready") {
          this.trackedEntries.delete(entry.discordId);
        }
      } else if (status.position === null) {
        this.trackedEntries.delete(entry.discordId);
      }
    }
  }

  async joinQueue(
    discordId: string,
    guildId: string,
    channelId: string,
  ): Promise<JoinQueueResult> {
    const user = await this.realmsApi.getUserByDiscordId(discordId);
    if (!user) {
      return { status: "not_linked" };
    }

    const result = await this.realmsApi.joinConstructedQueue({
      playerId: user.id,
      discordId,
      guildId,
      channelId,
    });

    if (result.pendingMatch) {
      const match = await this.resolveMatchInfo(result.pendingMatch);
      await this.notifyMatchUpdate(
        { discordId, playerId: user.id, guildId, channelId },
        match,
        { skipChannelAnnouncement: true },
      );
      if (match.status === "ready") {
        this.trackedEntries.delete(discordId);
      } else {
        this.trackedEntries.set(discordId, {
          discordId,
          playerId: user.id,
          guildId,
          channelId,
        });
      }
      return {
        status: "matched",
        queueSize: result.queueSize,
        match,
      };
    }

    this.trackedEntries.set(discordId, {
      discordId,
      playerId: user.id,
      guildId,
      channelId,
    });

    return {
      status: result.status,
      position: result.position,
      queueSize: result.queueSize,
      wasEmpty: result.wasEmpty,
    };
  }

  async leaveQueue(discordId: string): Promise<boolean> {
    const tracked = this.trackedEntries.get(discordId);
    const user = tracked
      ? { id: tracked.playerId }
      : await this.realmsApi.getUserByDiscordId(discordId);
    if (!user) return false;
    const removed = await this.realmsApi.leaveConstructedQueue(user.id);
    this.trackedEntries.delete(discordId);
    return removed;
  }

  async getQueueSize(): Promise<number> {
    const first = this.trackedEntries.values().next().value as
      | ActiveDiscordQueueEntry
      | undefined;
    if (first) {
      const status = await this.realmsApi.getConstructedQueueStatus(
        first.playerId,
      );
      return status.queueSize;
    }
    return 0;
  }

  async getGuildQueueSize(guildId: string): Promise<number> {
    const first = Array.from(this.trackedEntries.values()).find(
      (entry) => entry.guildId === guildId,
    );
    if (!first) return 0;
    const status = await this.realmsApi.getConstructedQueueStatus(
      first.playerId,
      guildId,
    );
    return status.guildQueueSize;
  }

  async getPlayerPosition(discordId: string): Promise<number | null> {
    const tracked = this.trackedEntries.get(discordId);
    const user = tracked
      ? { id: tracked.playerId, guildId: tracked.guildId }
      : await this.realmsApi.getUserByDiscordId(discordId);
    if (!user) return null;
    const status = await this.realmsApi.getConstructedQueueStatus(
      user.id,
      tracked?.guildId,
    );
    return status.position;
  }

  async getStatus(
    discordId: string,
    guildId?: string,
  ): Promise<QueueStatus | null> {
    const tracked = this.trackedEntries.get(discordId);
    const user = tracked
      ? { id: tracked.playerId }
      : await this.realmsApi.getUserByDiscordId(discordId);
    if (!user) return null;
    return this.realmsApi.getConstructedQueueStatus(
      user.id,
      guildId || tracked?.guildId,
    );
  }

  async acceptPendingMatch(
    discordId: string,
  ): Promise<QueueConfirmationResult> {
    const tracked = this.trackedEntries.get(discordId);
    const user = tracked
      ? { id: tracked.playerId }
      : await this.realmsApi.getUserByDiscordId(discordId);
    if (!user) return { ok: false };

    const result = await this.realmsApi.acceptConstructedQueueMatch(user.id);
    if (!result.ok) return { ok: false };

    const pending = result.pendingMatch;
    if (!pending) return { ok: true };
    const match = await this.resolveMatchInfo(pending);
    if (tracked) {
      await this.notifyMatchUpdate(tracked, match, {
        skipChannelAnnouncement: match.status !== "ready",
      });
    }
    if (match.status === "ready") {
      this.trackedEntries.delete(discordId);
    }
    return { ok: true, match };
  }

  async declinePendingMatch(discordId: string): Promise<boolean> {
    const tracked = this.trackedEntries.get(discordId);
    const user = tracked
      ? { id: tracked.playerId }
      : await this.realmsApi.getUserByDiscordId(discordId);
    if (!user) return false;
    const result = await this.realmsApi.declineConstructedQueueMatch(user.id);
    this.trackedEntries.delete(discordId);
    return result.ok;
  }

  async postAnnouncement(channelId: string, message: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && "send" in channel) {
        await (channel as TextChannel).send(message);
      }
    } catch (err) {
      console.error("[shared-queue-manager] Failed to post announcement:", err);
    }
  }

  async cleanup(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.trackedEntries.clear();
    this.announcedMatches.clear();
  }
}

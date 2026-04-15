/**
 * API client for communicating with the Realms.cards server.
 */

import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  discordId: z.string().nullable(),
  online: z.boolean().optional(),
});

const MatchCreatedSchema = z.object({
  matchId: z.string(),
  lobbyId: z.string(),
  joinUrl: z.string(),
  format: z.string(),
  challenger: z.object({
    id: z.string(),
    name: z.string().nullable(),
    shortId: z.string().nullable(),
  }),
  challengee: z.object({
    id: z.string(),
    name: z.string().nullable(),
    shortId: z.string().nullable(),
  }),
});

const ChallengeSchema = z.object({
  id: z.string(),
  challengerId: z.string(),
  challengeeId: z.string(),
  format: z.string(),
  status: z.string(),
  matchId: z.string().nullable(),
  expiresAt: z.string(),
});

const PendingQueueMatchSchema = z.object({
  lobbyId: z.string(),
  opponentPlayerId: z.string(),
  opponentPlayerName: z.string().nullable().optional(),
  matchType: z.literal("constructed"),
  isHost: z.boolean(),
  createdAt: z.number(),
  status: z.enum(["confirming", "ready"]).optional().default("ready"),
  confirmExpiresAt: z.number().nullable().optional(),
  youAccepted: z.boolean().optional(),
});

const QueueJoinResponseSchema = z.object({
  status: z.enum(["queued", "matched", "already_in_queue"]),
  position: z.number().int().positive().optional(),
  queueSize: z.number().int().min(0),
  wasEmpty: z.boolean().optional(),
  pendingMatch: PendingQueueMatchSchema.nullable().optional(),
});

const QueueStatusSchema = z.object({
  queueSize: z.number().int().min(0),
  guildQueueSize: z.number().int().min(0),
  position: z.number().int().positive().nullable(),
  pendingMatch: PendingQueueMatchSchema.nullable(),
});

const QueueLeaveResponseSchema = z.object({
  removed: z.boolean(),
});

const QueueConfirmationResponseSchema = z.object({
  ok: z.boolean(),
  status: z.string().optional(),
  lobbyId: z.string().optional(),
  pendingMatch: PendingQueueMatchSchema.nullable().optional(),
  queueSize: z.number().int().min(0).optional(),
  removed: z.boolean().optional(),
});

export type RealmsUser = z.infer<typeof UserSchema>;
export type MatchCreated = z.infer<typeof MatchCreatedSchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;
export type PendingQueueMatch = z.infer<typeof PendingQueueMatchSchema>;
export type QueueJoinResponse = z.infer<typeof QueueJoinResponseSchema>;
export type QueueStatus = z.infer<typeof QueueStatusSchema>;
export type QueueConfirmationResponse = z.infer<
  typeof QueueConfirmationResponseSchema
>;

export class RealmsApiClient {
  private baseUrl: string;
  private secret: string;

  constructor(baseUrl: string, secret: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.secret = secret;
  }

  buildLobbyUrl(lobbyId: string): string {
    const url = new URL(
      `/online/lobby?invite=${encodeURIComponent(lobbyId)}`,
      this.baseUrl,
    );
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.secret}`,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Get user by Discord ID.
   */
  async getUserByDiscordId(discordId: string): Promise<RealmsUser | null> {
    try {
      const data = await this.request<unknown>(
        "GET",
        `/api/bot/users/by-discord/${discordId}`,
      );
      return UserSchema.parse(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        return null;
      }
      throw err;
    }
  }

  async unlinkUserByDiscordId(discordId: string): Promise<void> {
    await this.request("DELETE", `/api/bot/users/by-discord/${discordId}`);
  }

  /**
   * Get user by Realms.cards user ID.
   */
  async getUserById(userId: string): Promise<RealmsUser | null> {
    try {
      const data = await this.request<unknown>(
        "GET",
        `/api/bot/users/${userId}`,
      );
      return UserSchema.parse(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create a link token for account linking.
   */
  async createLinkToken(
    discordId: string,
    discordTag: string,
    guildId: string,
  ): Promise<{ token: string; linkUrl: string }> {
    return this.request("POST", "/api/bot/link-token", {
      discordId,
      discordTag,
      guildId,
    });
  }

  /**
   * Create a challenge between two players.
   */
  async createChallenge(
    challengerDiscordId: string,
    challengeeDiscordId: string,
    format: string,
    guildId: string,
    channelId: string,
  ): Promise<Challenge> {
    const data = await this.request<unknown>("POST", "/api/bot/challenges", {
      challengerDiscordId,
      challengeeDiscordId,
      format,
      guildId,
      channelId,
    });
    return ChallengeSchema.parse(data);
  }

  /**
   * Accept a challenge and create a match.
   */
  async acceptChallenge(challengeId: string): Promise<MatchCreated> {
    const data = await this.request<unknown>(
      "POST",
      `/api/bot/challenges/${challengeId}/accept`,
    );
    return MatchCreatedSchema.parse(data);
  }

  /**
   * Decline a challenge.
   */
  async declineChallenge(challengeId: string): Promise<void> {
    await this.request("POST", `/api/bot/challenges/${challengeId}/decline`);
  }

  /**
   * Get pending challenge for a user.
   */
  async getPendingChallenge(discordId: string): Promise<Challenge | null> {
    try {
      const data = await this.request<unknown>(
        "GET",
        `/api/bot/challenges/pending/${discordId}`,
      );
      return ChallengeSchema.parse(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        return null;
      }
      throw err;
    }
  }

  async joinConstructedQueue(input: {
    playerId: string;
    discordId: string;
    guildId: string;
    channelId: string;
  }): Promise<QueueJoinResponse> {
    const data = await this.request<unknown>(
      "POST",
      "/api/bot/queue/constructed/join",
      input,
    );
    return QueueJoinResponseSchema.parse(data);
  }

  async leaveConstructedQueue(playerId: string): Promise<boolean> {
    const data = await this.request<unknown>(
      "POST",
      "/api/bot/queue/constructed/leave",
      { playerId },
    );
    return QueueLeaveResponseSchema.parse(data).removed;
  }

  async getConstructedQueueStatus(
    playerId: string,
    guildId?: string,
  ): Promise<QueueStatus> {
    const params = new URLSearchParams({ playerId });
    if (guildId) params.set("guildId", guildId);
    const data = await this.request<unknown>(
      "GET",
      `/api/bot/queue/constructed/status?${params.toString()}`,
    );
    return QueueStatusSchema.parse(data);
  }

  async acceptConstructedQueueMatch(
    playerId: string,
  ): Promise<QueueConfirmationResponse> {
    const data = await this.request<unknown>(
      "POST",
      "/api/bot/queue/constructed/accept",
      { playerId },
    );
    return QueueConfirmationResponseSchema.parse(data);
  }

  async declineConstructedQueueMatch(
    playerId: string,
  ): Promise<QueueConfirmationResponse> {
    const data = await this.request<unknown>(
      "POST",
      "/api/bot/queue/constructed/decline",
      { playerId },
    );
    return QueueConfirmationResponseSchema.parse(data);
  }

  /**
   * Get player info for voice channel creation.
   */
  async getVoiceChannelPlayers(
    matchId: string,
    player1Id: string,
    player2Id: string,
  ): Promise<{
    matchId: string;
    player1: { id: string; name: string; discordId: string };
    player2: { id: string; name: string; discordId: string };
  }> {
    return this.request("POST", `/api/bot/voice/create`, {
      matchId,
      player1Id,
      player2Id,
    });
  }

  /**
   * Notify API that voice channel is being deleted.
   */
  async notifyVoiceChannelDeleted(matchId: string): Promise<void> {
    await this.request("POST", `/api/bot/voice/delete`, { matchId });
  }
}

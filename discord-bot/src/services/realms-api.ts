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
  joinTokenP1: z.string(),
  joinTokenP2: z.string(),
  joinUrlP1: z.string(),
  joinUrlP2: z.string(),
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

export type RealmsUser = z.infer<typeof UserSchema>;
export type MatchCreated = z.infer<typeof MatchCreatedSchema>;
export type Challenge = z.infer<typeof ChallengeSchema>;

export class RealmsApiClient {
  private baseUrl: string;
  private secret: string;

  constructor(baseUrl: string, secret: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.secret = secret;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
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
        `/api/bot/users/by-discord/${discordId}`
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
   * Get user by Realms.cards user ID.
   */
  async getUserById(userId: string): Promise<RealmsUser | null> {
    try {
      const data = await this.request<unknown>(
        "GET",
        `/api/bot/users/${userId}`
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
    guildId: string
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
    channelId: string
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
      `/api/bot/challenges/${challengeId}/accept`
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
        `/api/bot/challenges/pending/${discordId}`
      );
      return ChallengeSchema.parse(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Request a Discord voice channel for a match.
   */
  async requestVoiceChannel(
    matchId: string,
    requesterId: string
  ): Promise<{
    approved: boolean;
    player1DiscordId?: string;
    player2DiscordId?: string;
  }> {
    return this.request("POST", `/api/bot/matches/${matchId}/voice`, {
      requesterId,
    });
  }
}

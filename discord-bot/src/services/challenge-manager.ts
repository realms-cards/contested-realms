/**
 * Manages match challenges between Discord users.
 */

import type { RealmsApiClient, Challenge } from "./realms-api.js";

export class ChallengeManager {
  private api: RealmsApiClient;
  // Local cache of pending challenges for quick lookup
  private pendingChallenges: Map<string, Challenge> = new Map();

  constructor(api: RealmsApiClient) {
    this.api = api;

    // Cleanup expired challenges periodically
    setInterval(() => this.cleanupExpired(), 60_000);
  }

  /**
   * Create a new challenge.
   */
  async createChallenge(
    challengerDiscordId: string,
    challengeeDiscordId: string,
    format: string,
    guildId: string,
    channelId: string,
  ): Promise<Challenge> {
    const challenge = await this.api.createChallenge(
      challengerDiscordId,
      challengeeDiscordId,
      format,
      guildId,
      channelId,
    );

    this.pendingChallenges.set(challenge.id, challenge);
    return challenge;
  }

  /**
   * Accept a challenge.
   */
  async acceptChallenge(challengeId: string) {
    const result = await this.api.acceptChallenge(challengeId);
    this.pendingChallenges.delete(challengeId);
    return result;
  }

  /**
   * Decline a challenge.
   */
  async declineChallenge(challengeId: string): Promise<void> {
    await this.api.declineChallenge(challengeId);
    this.pendingChallenges.delete(challengeId);
  }

  /**
   * Get pending challenge for a user (as challengee).
   */
  async getPendingChallengeFor(discordId: string): Promise<Challenge | null> {
    return this.api.getPendingChallenge(discordId);
  }

  /**
   * Remove expired challenges from local cache.
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, challenge] of this.pendingChallenges) {
      const expiresAt = new Date(challenge.expiresAt).getTime();
      if (now > expiresAt) {
        this.pendingChallenges.delete(id);
      }
    }
  }
}

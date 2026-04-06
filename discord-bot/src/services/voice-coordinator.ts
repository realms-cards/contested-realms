/**
 * Coordinates voice channel creation with the Realms API.
 * Handles the flow: match created -> fetch player info -> create channel -> notify players
 */

import type { RealmsApiClient } from "./realms-api.js";
import type { VoiceChannelManager } from "./voice-manager.js";

interface VoiceChannelRequest {
  matchId: string;
  player1Id: string;
  player2Id: string;
}

export class VoiceCoordinator {
  private realmsApi: RealmsApiClient;
  private voiceManager: VoiceChannelManager;
  private pendingRequests: Map<string, VoiceChannelRequest> = new Map();

  constructor(realmsApi: RealmsApiClient, voiceManager: VoiceChannelManager) {
    this.realmsApi = realmsApi;
    this.voiceManager = voiceManager;
  }

  /**
   * Request voice channel creation for a match.
   * Called when a match is created via challenge accept.
   */
  async requestVoiceChannel(
    matchId: string,
    player1Id: string,
    player2Id: string,
    guildId: string,
  ): Promise<{ channelId: string; inviteUrl: string } | null> {
    try {
      console.log(
        `[voice-coord] Requesting voice channel for match ${matchId}`
      );

      // Get player Discord info from API
      const playerInfo = await this.realmsApi.getVoiceChannelPlayers(
        matchId,
        player1Id,
        player2Id
      );

      // Create the voice channel
      const result = await this.voiceManager.createMatchChannel(
        guildId,
        matchId,
        playerInfo.player1.name,
        playerInfo.player1.discordId,
        playerInfo.player2.name,
        playerInfo.player2.discordId
      );

      console.log(
        `[voice-coord] Created voice channel ${result.channelId} for match ${matchId}`
      );

      return result;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Discord linked")) {
        console.log(
          `[voice-coord] Cannot create voice channel for ${matchId}: players not linked`
        );
        return null;
      }
      console.error(`[voice-coord] Failed to create voice channel:`, err);
      return null;
    }
  }

  /**
   * Delete voice channel for a match.
   * Called when a match ends.
   */
  async deleteVoiceChannel(matchId: string): Promise<void> {
    try {
      await this.voiceManager.deleteChannel(matchId);
      await this.realmsApi.notifyVoiceChannelDeleted(matchId);
      console.log(`[voice-coord] Deleted voice channel for match ${matchId}`);
    } catch (err) {
      console.error(
        `[voice-coord] Failed to delete voice channel for ${matchId}:`,
        err
      );
    }
  }

  /**
   * Get existing voice channel for a match.
   */
  getVoiceChannel(
    matchId: string
  ): { channelId: string; inviteUrl: string } | null {
    const managed = this.voiceManager.getChannel(matchId);
    if (!managed) return null;

    // Channel exists, but we need to create a fresh invite
    // (The original invite might have expired)
    return {
      channelId: managed.channel.id,
      inviteUrl: `https://discord.gg/${managed.channel.id}`, // Fallback URL
    };
  }

  /**
   * Cleanup all voice channels on shutdown.
   */
  async cleanup(): Promise<void> {
    await this.voiceManager.cleanup();
  }
}

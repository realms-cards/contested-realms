/**
 * Manages Discord voice channels for matches.
 * Creates temporary private channels and handles cleanup.
 */

import {
  Client,
  Guild,
  VoiceChannel,
  ChannelType,
  PermissionFlagsBits,
  CategoryChannel,
} from "discord.js";

const VOICE_CATEGORY_NAME = "Realms Matches";
const CHANNEL_CLEANUP_DELAY_MS = 30_000; // 30 seconds after empty

interface ManagedChannel {
  channel: VoiceChannel;
  matchId: string;
  player1DiscordId: string;
  player2DiscordId: string;
  cleanupTimer?: NodeJS.Timeout;
}

export class VoiceChannelManager {
  private client: Client;
  private channels: Map<string, ManagedChannel> = new Map();

  constructor(client: Client) {
    this.client = client;
  }

  private async getGuild(guildId: string): Promise<Guild> {
    const guild = await this.client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found`);
    }
    return guild;
  }

  private async getOrCreateCategory(guild: Guild): Promise<CategoryChannel> {
    // Look for existing category
    const existing = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name === VOICE_CATEGORY_NAME,
    ) as CategoryChannel | undefined;

    if (existing) return existing;

    // Create new category
    const category = await guild.channels.create({
      name: VOICE_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
        },
      ],
    });

    return category;
  }

  /**
   * Create a private voice channel for a match.
   */
  async createMatchChannel(
    guildId: string,
    matchId: string,
    player1Name: string,
    player1DiscordId: string,
    player2Name: string,
    player2DiscordId: string,
  ): Promise<{ channelId: string; inviteUrl: string }> {
    const guild = await this.getGuild(guildId);
    const category = await this.getOrCreateCategory(guild);

    const channelName = `${player1Name} vs ${player2Name}`;

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: category.id,
      userLimit: 2,
      permissionOverwrites: [
        // Deny everyone by default
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
        },
        // Allow player 1
        {
          id: player1DiscordId,
          allow: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Speak,
          ],
        },
        // Allow player 2
        {
          id: player2DiscordId,
          allow: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Speak,
          ],
        },
      ],
    });

    // Create invite
    const invite = await channel.createInvite({
      maxAge: 3600, // 1 hour
      maxUses: 0, // Unlimited
      unique: true,
    });

    // Track the channel
    this.channels.set(matchId, {
      channel,
      matchId,
      player1DiscordId,
      player2DiscordId,
    });

    console.log(`[voice] Created channel ${channel.id} for match ${matchId}`);

    return {
      channelId: channel.id,
      inviteUrl: invite.url,
    };
  }

  /**
   * Get channel for a match.
   */
  getChannel(matchId: string): ManagedChannel | undefined {
    return this.channels.get(matchId);
  }

  /**
   * Handle voice state change - schedule cleanup when empty.
   */
  onVoiceStateUpdate(
    channelId: string,
    isEmpty: boolean,
    matchId?: string,
  ): void {
    // Find managed channel
    let managed: ManagedChannel | undefined;
    for (const [mId, ch] of this.channels) {
      if (ch.channel.id === channelId) {
        managed = ch;
        matchId = mId;
        break;
      }
    }

    if (!managed || !matchId) return;
    const managedMatchId = matchId;

    if (isEmpty) {
      // Schedule cleanup
      if (!managed.cleanupTimer) {
        console.log(
          `[voice] Channel ${channelId} is empty, scheduling cleanup...`,
        );
        managed.cleanupTimer = setTimeout(() => {
          this.deleteChannel(managedMatchId);
        }, CHANNEL_CLEANUP_DELAY_MS);
      }
    } else {
      // Cancel cleanup if someone joined
      if (managed.cleanupTimer) {
        console.log(`[voice] Channel ${channelId} occupied, canceling cleanup`);
        clearTimeout(managed.cleanupTimer);
        managed.cleanupTimer = undefined;
      }
    }
  }

  /**
   * Delete a match voice channel.
   */
  async deleteChannel(matchId: string): Promise<void> {
    const managed = this.channels.get(matchId);
    if (!managed) return;

    try {
      if (managed.cleanupTimer) {
        clearTimeout(managed.cleanupTimer);
      }

      await managed.channel.delete("Match ended");
      console.log(`[voice] Deleted channel for match ${matchId}`);
    } catch (err) {
      console.error(`[voice] Failed to delete channel for ${matchId}:`, err);
    }

    this.channels.delete(matchId);
  }

  /**
   * Clean up all managed channels (on shutdown).
   */
  async cleanup(): Promise<void> {
    for (const [matchId] of this.channels) {
      await this.deleteChannel(matchId);
    }
  }
}

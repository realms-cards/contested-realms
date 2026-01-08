/**
 * Handle voice state changes for channel cleanup.
 */

import { VoiceState } from "discord.js";
import type { VoiceChannelManager } from "../services/voice-manager.js";

export function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
  voiceManager: VoiceChannelManager
): void {
  // User left a channel
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const channel = oldState.channel;
    if (channel) {
      const isEmpty = channel.members.size === 0;
      voiceManager.onVoiceStateUpdate(oldState.channelId, isEmpty);
    }
  }

  // User joined a channel
  if (newState.channelId && newState.channelId !== oldState.channelId) {
    voiceManager.onVoiceStateUpdate(newState.channelId, false);
  }
}

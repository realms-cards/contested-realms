/**
 * Shared bot context - services and client accessible from commands.
 * Separated from index.ts to avoid circular imports triggering bot startup.
 */

import type { Client } from "discord.js";
import type { ChallengeManager } from "./challenge-manager.js";
import type { QueueManager } from "./queue-manager.js";
import type { RealmsApiClient } from "./realms-api.js";
import type { VoiceCoordinator } from "./voice-coordinator.js";
import type { VoiceChannelManager } from "./voice-manager.js";

export interface BotContext {
  client: Client;
  realmsApi: RealmsApiClient;
  voiceManager: VoiceChannelManager;
  voiceCoordinator: VoiceCoordinator;
  challengeManager: ChallengeManager;
  queueManager: QueueManager;
}

let context: BotContext | null = null;

export function setContext(ctx: BotContext): void {
  context = ctx;
}

export function getServices(): BotContext {
  if (!context) {
    throw new Error("Bot context not initialized - services not available yet");
  }
  return context;
}

/**
 * Shared bot context - services and client accessible from commands.
 * Separated from index.ts to avoid circular imports triggering bot startup.
 */

import type { Client } from "discord.js";
import type { RealmsApiClient } from "./realms-api.js";
import type { VoiceChannelManager } from "./voice-manager.js";
import type { ChallengeManager } from "./challenge-manager.js";

export interface BotContext {
  client: Client;
  realmsApi: RealmsApiClient;
  voiceManager: VoiceChannelManager;
  challengeManager: ChallengeManager;
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

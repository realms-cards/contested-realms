import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { registerCommands } from "./commands/index.js";
import { handleInteraction } from "./events/interactionCreate.js";
import { handleVoiceStateUpdate } from "./events/voiceStateUpdate.js";
import { RealmsApiClient } from "./services/realms-api.js";
import { VoiceChannelManager } from "./services/voice-manager.js";
import { ChallengeManager } from "./services/challenge-manager.js";
import { setContext } from "./services/context.js";
import { acquireBotLock, releaseBotLock } from "./services/leader-lock.js";

const REQUIRED_ENV = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "REALMS_API_URL",
  "REALMS_BOT_SECRET",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// Services (initialized after client ready)
let voiceManager: VoiceChannelManager;

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[bot] Logged in as ${readyClient.user.tag}`);

  // Initialize services
  const realmsApi = new RealmsApiClient(
    process.env.REALMS_API_URL!,
    process.env.REALMS_BOT_SECRET!
  );
  voiceManager = new VoiceChannelManager(readyClient);
  const challengeManager = new ChallengeManager(realmsApi);

  // Set context for command handlers
  setContext({
    client: readyClient,
    realmsApi,
    voiceManager,
    challengeManager,
  });

  // Register slash commands
  await registerCommands();

  console.log("[bot] Ready and listening for commands");
});

client.on(Events.InteractionCreate, handleInteraction);
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (voiceManager) {
    handleVoiceStateUpdate(oldState, newState, voiceManager);
  }
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[bot] Received ${signal}, shutting down...`);

  try {
    await releaseBotLock();
    client.destroy();
    console.log("[bot] Disconnected from Discord");
  } catch (err) {
    console.error("[bot] Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Main startup with leader election
async function main() {
  console.log("[bot] Starting Realms.cards Discord bot...");

  // Acquire leader lock (only one bot instance should run)
  const isLeader = await acquireBotLock();
  if (!isLeader) {
    console.log("[bot] Another bot instance is already running. Exiting.");
    process.exit(0);
  }

  console.log("[bot] Acquired leader lock, connecting to Discord...");

  try {
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } catch (err) {
    console.error("[bot] Failed to connect to Discord:", err);
    await releaseBotLock();
    process.exit(1);
  }
}

main();

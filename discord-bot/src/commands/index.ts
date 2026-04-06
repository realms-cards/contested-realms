/**
 * Slash command registration and management.
 */

import {
  ChatInputCommandInteraction,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { challengeCommand } from "./challenge.js";
import { linkCommand } from "./link.js";
import { queueCommand } from "./queue.js";
import { statusCommand } from "./status.js";

export interface CommandModule {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// All available commands
export const commands = new Map<string, CommandModule>([
  ["challenge", challengeCommand],
  ["link", linkCommand],
  ["queue", queueCommand],
  ["status", statusCommand],
]);

/**
 * Register slash commands with Discord.
 */
export async function registerCommands(): Promise<void> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!clientId || !token) {
    throw new Error(
      "Missing Discord command registration environment variables",
    );
  }

  const rest = new REST({ version: "10" }).setToken(token);

  const commandsJson = Array.from(commands.values()).map((cmd) =>
    cmd.data.toJSON(),
  );

  try {
    console.log(`[commands] Registering ${commandsJson.length} commands...`);

    if (process.env.NODE_ENV === "development" && guildId) {
      // Guild-specific commands (instant update, good for development)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandsJson,
      });
      console.log(`[commands] Registered guild commands for ${guildId}`);
    } else {
      // Global commands (takes up to 1 hour to propagate)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandsJson,
      });
      console.log("[commands] Registered global commands");
    }
  } catch (err) {
    console.error("[commands] Failed to register commands:", err);
    throw err;
  }
}

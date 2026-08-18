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
import { duelistCommand } from "./duelist.js";
import { lfgConfigCommand } from "./lfg-config.js";
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
  ["duelist", duelistCommand],
  ["lfg-config", lfgConfigCommand],
  ["link", linkCommand],
  ["queue", queueCommand],
  ["status", statusCommand],
]);

/**
 * Where to publish commands.
 *
 * - `guild`: instant, but only visible in that one server. Best for testing.
 * - `global`: every server, but Discord takes up to an hour to propagate.
 * - `auto`: guild in development (when DISCORD_GUILD_ID is set), else global.
 */
export type CommandScope = "guild" | "global" | "auto";

interface RegisterOptions {
  scope?: CommandScope;
  guildId?: string;
}

interface RegisteredCommand {
  id: string;
  name: string;
}

function getRestCredentials(): { clientId: string; rest: REST } {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!clientId || !token) {
    throw new Error(
      "Missing Discord command registration environment variables",
    );
  }
  return { clientId, rest: new REST({ version: "10" }).setToken(token) };
}

/**
 * Register slash commands with Discord.
 */
export async function registerCommands(
  options: RegisterOptions = {},
): Promise<void> {
  const { clientId, rest } = getRestCredentials();
  const guildId = options.guildId || process.env.DISCORD_GUILD_ID;
  const scope = options.scope ?? "auto";

  const commandsJson = Array.from(commands.values()).map((cmd) =>
    cmd.data.toJSON(),
  );

  const useGuild =
    scope === "guild" ||
    (scope === "auto" && process.env.NODE_ENV === "development" && !!guildId);

  if (useGuild && !guildId) {
    throw new Error(
      "Guild command registration requires DISCORD_GUILD_ID (or --guild <id>)",
    );
  }

  try {
    console.log(
      `[commands] Registering ${commandsJson.length} commands (${commandsJson
        .map((c) => c.name)
        .join(", ")})...`,
    );

    if (useGuild && guildId) {
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
      console.log(
        "[commands] Registered global commands (can take up to 1 hour to appear)",
      );
    }
  } catch (err) {
    console.error("[commands] Failed to register commands:", err);
    throw err;
  }
}

/**
 * What Discord currently has registered, so a missing command can be told
 * apart from one that simply hasn't propagated yet.
 */
export async function listRegisteredCommands(guildId?: string): Promise<{
  global: RegisteredCommand[];
  guild: RegisteredCommand[] | null;
}> {
  const { clientId, rest } = getRestCredentials();
  const targetGuild = guildId || process.env.DISCORD_GUILD_ID;

  const globalCommands = (await rest.get(
    Routes.applicationCommands(clientId),
  )) as RegisteredCommand[];

  let guildCommands: RegisteredCommand[] | null = null;
  if (targetGuild) {
    guildCommands = (await rest.get(
      Routes.applicationGuildCommands(clientId, targetGuild),
    )) as RegisteredCommand[];
  }

  return { global: globalCommands, guild: guildCommands };
}

/**
 * Drop the guild-scoped copies. Worth doing once a global deploy has
 * propagated, since a stale guild command shadows the global one of the same
 * name in that server.
 */
export async function clearGuildCommands(guildId?: string): Promise<void> {
  const { clientId, rest } = getRestCredentials();
  const targetGuild = guildId || process.env.DISCORD_GUILD_ID;
  if (!targetGuild) {
    throw new Error("Clearing guild commands requires DISCORD_GUILD_ID");
  }

  await rest.put(Routes.applicationGuildCommands(clientId, targetGuild), {
    body: [],
  });
  console.log(`[commands] Cleared guild commands for ${targetGuild}`);
}

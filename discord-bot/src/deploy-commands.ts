/**
 * Standalone script to deploy slash commands to Discord.
 *
 *   npm run deploy-commands              # global (up to 1 hour to propagate)
 *   npm run deploy-commands -- --guild   # instant, DISCORD_GUILD_ID only
 *   npm run deploy-commands -- --list    # show what Discord has registered
 *   npm run deploy-commands -- --clear-guild
 *
 * Pass `--guild <id>` to target a server other than DISCORD_GUILD_ID.
 */

import "dotenv/config";
import {
  clearGuildCommands,
  listRegisteredCommands,
  registerCommands,
  type CommandScope,
} from "./commands/index.js";

interface Args {
  scope: CommandScope;
  guildId?: string;
  list: boolean;
  clearGuild: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { scope: "auto", list: false, clearGuild: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--guild") {
      args.scope = "guild";
      // An id may follow, but `--guild` alone means DISCORD_GUILD_ID.
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.guildId = next;
        i++;
      }
    } else if (arg === "--global") {
      args.scope = "global";
    } else if (arg === "--list") {
      args.list = true;
    } else if (arg === "--clear-guild") {
      args.clearGuild = true;
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.guildId = next;
        i++;
      }
    } else {
      console.warn(`Ignoring unknown argument: ${arg}`);
    }
  }

  return args;
}

function printCommands(label: string, list: { name: string }[] | null): void {
  if (list === null) {
    console.log(`${label}: (no guild id configured)`);
    return;
  }
  if (list.length === 0) {
    console.log(`${label}: (none)`);
    return;
  }
  console.log(
    `${label}: ${list
      .map((c) => `/${c.name}`)
      .sort()
      .join(", ")}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    if (args.list) {
      const { global, guild } = await listRegisteredCommands(args.guildId);
      printCommands("Global commands", global);
      printCommands(
        `Guild commands (${args.guildId || process.env.DISCORD_GUILD_ID})`,
        guild,
      );
      // Guild copies win over global ones of the same name in that server.
      const shadowed = (guild ?? [])
        .map((c) => c.name)
        .filter((name) => global.some((g) => g.name === name));
      if (shadowed.length > 0) {
        console.log(
          `\nNote: ${shadowed
            .map((n) => `/${n}`)
            .join(", ")} exist in both scopes — the guild copy is what that server sees.`,
        );
      }
      process.exit(0);
    }

    if (args.clearGuild) {
      await clearGuildCommands(args.guildId);
      console.log("✅ Guild commands cleared.");
      process.exit(0);
    }

    console.log("Deploying Discord slash commands...");
    await registerCommands({ scope: args.scope, guildId: args.guildId });
    console.log("✅ Commands deployed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed:", err);
    process.exit(1);
  }
}

main();

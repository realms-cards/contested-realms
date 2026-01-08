/**
 * Standalone script to deploy slash commands to Discord.
 * Run this once after adding/modifying commands:
 *   npm run deploy-commands
 */

import "dotenv/config";
import { registerCommands } from "./commands/index.js";

async function main() {
  console.log("Deploying Discord slash commands...");

  try {
    await registerCommands();
    console.log("✅ Commands deployed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to deploy commands:", err);
    process.exit(1);
  }
}

main();

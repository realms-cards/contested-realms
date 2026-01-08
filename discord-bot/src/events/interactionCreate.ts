/**
 * Handle all Discord interactions (slash commands, buttons, etc.)
 */

import { Interaction, ChatInputCommandInteraction } from "discord.js";
import { commands } from "../commands/index.js";

export async function handleInteraction(
  interaction: Interaction
): Promise<void> {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);

    if (!command) {
      console.warn(`[interaction] Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      console.log(
        `[interaction] ${interaction.user.tag} used /${interaction.commandName}`
      );
      await command.execute(interaction as ChatInputCommandInteraction);
    } catch (err) {
      console.error(`[interaction] Command error:`, err);

      const errorMessage = "❌ An error occurred while executing this command.";

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  // Button interactions are handled in the command collectors
  // (see challenge.ts for example)
}

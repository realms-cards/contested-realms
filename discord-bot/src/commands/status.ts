/**
 * /status command - Check your status and see who's online.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getServices } from "../services/context.js";

export const statusCommand = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check your Realms.cards status and see who's online"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { realmsApi } = getServices();

    await interaction.deferReply({ flags: 64 }); // Ephemeral

    // Check if user is linked
    const user = await realmsApi.getUserByDiscordId(interaction.user.id);

    if (!user) {
      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("❌ Not Linked")
        .setDescription(
          "Your Discord account is not linked to Realms.cards. Use `/link start` to get started!"
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle("🎮 Your Realms.cards Status")
      .addFields(
        { name: "Display Name", value: user.name || "Not set", inline: true },
        {
          name: "Status",
          value: user.online ? "🟢 Online" : "⚪ Offline",
          inline: true,
        }
      )
      .setFooter({ text: "Visit realms.cards to play!" });

    if (user.image) {
      embed.setThumbnail(user.image);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

/**
 * /link command - Link Discord account to Realms.cards.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getServices } from "../services/context.js";

export const linkCommand = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to Realms.cards")
    .addSubcommand((sub) =>
      sub.setName("start").setDescription("Start the account linking process")
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Check your current link status")
    )
    .addSubcommand((sub) =>
      sub
        .setName("unlink")
        .setDescription("Unlink your Discord from Realms.cards")
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { realmsApi } = getServices();
    const subcommand = interaction.options.getSubcommand();

    // Defer reply immediately to prevent timeout
    await interaction.deferReply({ flags: 64 }); // Ephemeral

    if (subcommand === "start") {
      // Check if already linked
      const existing = await realmsApi.getUserByDiscordId(interaction.user.id);
      if (existing) {
        const embed = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle("✅ Already Linked!")
          .setDescription(
            `Your Discord is already linked to **${
              existing.name || "your account"
            }** on Realms.cards.`
          )
          .addFields({
            name: "Want to unlink?",
            value: "Use `/link unlink` to disconnect your accounts.",
          });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create link token
      try {
        const { linkUrl } = await realmsApi.createLinkToken(
          interaction.user.id,
          interaction.user.tag,
          interaction.guildId || ""
        );

        const embed = new EmbedBuilder()
          .setColor(0x7c3aed)
          .setTitle("🔗 Link Your Account")
          .setDescription(
            "Click the button below to link your Discord account to Realms.cards. You'll be asked to sign in (or create an account) on Realms.cards."
          )
          .addFields(
            {
              name: "Your Link",
              value: `[Click here to link](${linkUrl})`,
            },
            {
              name: "⚠️ Important",
              value:
                "This link expires in 15 minutes and can only be used once.",
            }
          )
          .setFooter({ text: "After linking, use /link status to verify" });

        // Send as DM for privacy
        try {
          await interaction.user.send({ embeds: [embed] });
          await interaction.editReply({
            content: "📬 Check your DMs for the link!",
          });
        } catch {
          // DMs disabled, reply in channel
          await interaction.editReply({ embeds: [embed] });
        }
      } catch (err) {
        console.error("[link] Create token failed:", err);
        await interaction.editReply({
          content: "❌ Failed to create link. Please try again.",
        });
      }
    } else if (subcommand === "status") {
      const user = await realmsApi.getUserByDiscordId(interaction.user.id);

      if (user) {
        const embed = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle("✅ Account Linked")
          .setDescription(`Your Discord is linked to Realms.cards.`)
          .addFields(
            {
              name: "Display Name",
              value: user.name || "Not set",
              inline: true,
            },
            { name: "User ID", value: user.id, inline: true }
          );

        if (user.image) {
          embed.setThumbnail(user.image);
        }

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("❌ Not Linked")
          .setDescription("Your Discord account is not linked to Realms.cards.")
          .addFields({
            name: "Get Started",
            value: "Use `/link start` to link your accounts.",
          });

        await interaction.editReply({ embeds: [embed] });
      }
    } else if (subcommand === "unlink") {
      const user = await realmsApi.getUserByDiscordId(interaction.user.id);

      if (!user) {
        await interaction.editReply({
          content: "❌ Your Discord is not linked to any Realms.cards account.",
        });
        return;
      }

      try {
        await realmsApi.unlinkUserByDiscordId(interaction.user.id);
        const embed = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle("✅ Account Unlinked")
          .setDescription(
            "Your Discord account has been unlinked from Realms.cards."
          );

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error("[link] Unlink failed:", err);
        await interaction.editReply({
          content: "❌ Failed to unlink your account. Please try again later.",
        });
      }
    }
  },
};

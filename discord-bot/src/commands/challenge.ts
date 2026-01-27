/**
 * /challenge command - Challenge another player to a match.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getServices } from "../services/context.js";

const CHALLENGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const challengeCommand = {
  data: new SlashCommandBuilder()
    .setName("challenge")
    .setDescription("Challenge another player to a match on Realms.cards")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("The player you want to challenge")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Game format")
        .setRequired(false)
        .addChoices(
          { name: "Constructed", value: "constructed" },
          { name: "Sealed", value: "sealed" },
          { name: "Draft", value: "draft" },
        ),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const { realmsApi, challengeManager } = getServices();

    const opponent = interaction.options.getUser("opponent", true);
    const format = interaction.options.getString("format") || "constructed";

    // Can't challenge yourself
    if (opponent.id === interaction.user.id) {
      await interaction.reply({
        content: "❌ You can't challenge yourself!",
        flags: 64, // Ephemeral
      });
      return;
    }

    // Can't challenge bots
    if (opponent.bot) {
      await interaction.reply({
        content: "❌ You can't challenge a bot!",
        flags: 64,
      });
      return;
    }

    // Defer reply before making API calls (Discord has 3s timeout)
    await interaction.deferReply();

    // Check if challenger has linked account
    const challenger = await realmsApi.getUserByDiscordId(interaction.user.id);
    if (!challenger) {
      await interaction.editReply({
        content:
          "❌ You need to link your Discord account first! Use `/link` to get started.",
      });
      return;
    }

    // Check if opponent has linked account
    const challengee = await realmsApi.getUserByDiscordId(opponent.id);
    if (!challengee) {
      await interaction.editReply({
        content: `❌ <@${opponent.id}> hasn't linked their Discord account to Realms.cards yet. Ask them to use \`/link\`!`,
      });
      return;
    }

    // Create challenge
    try {
      const challenge = await challengeManager.createChallenge(
        interaction.user.id,
        opponent.id,
        format,
        interaction.guildId || "",
        interaction.channelId,
      );

      // Build challenge embed
      const embed = new EmbedBuilder()
        .setColor(0x7c3aed)
        .setTitle("⚔️ Match Challenge!")
        .setDescription(
          `**${interaction.user.displayName}** has challenged **${opponent.displayName}** to a ${format} match!`,
        )
        .addFields(
          { name: "Format", value: format, inline: true },
          {
            name: "Challenger",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: "Challenged", value: `<@${opponent.id}>`, inline: true },
        )
        .setFooter({ text: "Challenge expires in 5 minutes" })
        .setTimestamp();

      // Accept/Decline buttons
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`challenge_accept:${challenge.id}`)
          .setLabel("Accept")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId(`challenge_decline:${challenge.id}`)
          .setLabel("Decline")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      );

      const reply = await interaction.editReply({
        content: `<@${opponent.id}>`,
        embeds: [embed],
        components: [row],
      });

      // Handle button interactions
      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: CHALLENGE_TIMEOUT_MS,
      });

      collector.on("collect", async (buttonInteraction) => {
        const [action, challengeId] = buttonInteraction.customId.split(":");

        // Only the challenged player can respond
        if (buttonInteraction.user.id !== opponent.id) {
          await buttonInteraction.reply({
            content: "❌ Only the challenged player can respond!",
            flags: 64,
          });
          return;
        }

        if (action === "challenge_accept") {
          try {
            const match = await challengeManager.acceptChallenge(challengeId);

            // Try to create voice channel for the match
            const { voiceCoordinator } = getServices();
            let voiceInfo: { channelId: string; inviteUrl: string } | null =
              null;
            try {
              voiceInfo = await voiceCoordinator.requestVoiceChannel(
                match.matchId,
                match.challenger.id,
                match.challengee.id,
              );
            } catch (err) {
              console.log("[challenge] Voice channel creation skipped:", err);
            }

            const acceptEmbed = new EmbedBuilder()
              .setColor(0x22c55e)
              .setTitle("✅ Challenge Accepted!")
              .setDescription(
                `The match is ready! Click the links below to join.`,
              )
              .addFields(
                {
                  name: `${interaction.user.displayName}'s Link`,
                  value: `[Join Match](${match.joinUrlP1})`,
                  inline: true,
                },
                {
                  name: `${opponent.displayName}'s Link`,
                  value: `[Join Match](${match.joinUrlP2})`,
                  inline: true,
                },
              );

            // Add voice channel info if created
            if (voiceInfo) {
              acceptEmbed.addFields({
                name: "🎤 Voice Channel",
                value: `[Join Voice](${voiceInfo.inviteUrl})`,
                inline: false,
              });
            }

            await buttonInteraction.update({
              embeds: [acceptEmbed],
              components: [],
            });

            // DM both players their personal links
            try {
              let p1Message = `🎮 Your match against **${opponent.displayName}** is ready!\n${match.joinUrlP1}`;
              let p2Message = `🎮 Your match against **${interaction.user.displayName}** is ready!\n${match.joinUrlP2}`;

              if (voiceInfo) {
                p1Message += `\n🎤 Voice: ${voiceInfo.inviteUrl}`;
                p2Message += `\n🎤 Voice: ${voiceInfo.inviteUrl}`;
              }

              await interaction.user.send({ content: p1Message });
              await opponent.send({ content: p2Message });
            } catch {
              // DMs might be disabled, that's okay
            }
          } catch (err) {
            console.error("[challenge] Accept failed:", err);
            await buttonInteraction.update({
              content: "❌ Failed to create match. Please try again.",
              embeds: [],
              components: [],
            });
          }
        } else if (action === "challenge_decline") {
          await challengeManager.declineChallenge(challengeId);

          const declineEmbed = new EmbedBuilder()
            .setColor(0xef4444)
            .setTitle("❌ Challenge Declined")
            .setDescription(
              `**${opponent.displayName}** declined the challenge.`,
            );

          await buttonInteraction.update({
            embeds: [declineEmbed],
            components: [],
          });
        }

        collector.stop();
      });

      collector.on("end", async (_, reason) => {
        if (reason === "time") {
          const expiredEmbed = new EmbedBuilder()
            .setColor(0x6b7280)
            .setTitle("⏰ Challenge Expired")
            .setDescription("The challenge was not accepted in time.");

          await interaction.editReply({
            embeds: [expiredEmbed],
            components: [],
          });
        }
      });
    } catch (err) {
      console.error("[challenge] Create failed:", err);

      // Check for 409 conflict (pending challenge exists)
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (
        errorMessage.includes("409") &&
        errorMessage.includes("pending challenge")
      ) {
        await interaction.editReply({
          content: `❌ You already have a pending challenge with <@${opponent.id}>. Wait for them to accept or decline, or try again after it expires (5 minutes).`,
        });
        return;
      }

      await interaction.editReply({
        content: "❌ Failed to create challenge. Please try again.",
      });
    }
  },
};

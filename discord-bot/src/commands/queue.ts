/**
 * /queue command - Join the matchmaking queue to find an opponent.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { getServices } from "../services/context.js";

export const queueCommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Join the matchmaking queue to find an opponent")
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Join the constructed matchmaking queue"),
    )
    .addSubcommand((sub) =>
      sub.setName("leave").setDescription("Leave the matchmaking queue"),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Check the current queue status"),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    // Defer reply immediately (ephemeral for most responses)
    await interaction.deferReply({ flags: 64 });

    if (subcommand === "join") {
      await handleJoin(interaction);
    } else if (subcommand === "leave") {
      await handleLeave(interaction);
    } else if (subcommand === "status") {
      await handleStatus(interaction);
    }
  },
};

async function handleJoin(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { queueManager } = getServices();

  const result = await queueManager.joinQueue(
    interaction.user.id,
    interaction.guildId || "",
    interaction.channelId,
  );

  if (result.status === "not_linked") {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("Account Not Linked")
      .setDescription(
        "You need to link your Discord account to Realms.cards before joining the queue.",
      )
      .addFields({
        name: "Get Started",
        value: "Use `/link start` to link your accounts.",
      });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (result.status === "already_in_queue") {
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle("Already in Queue")
      .setDescription("You're already in the matchmaking queue!")
      .addFields(
        { name: "Position", value: `#${result.position}`, inline: true },
        { name: "Queue Size", value: `${result.queueSize}`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (result.status === "matched") {
    // Match was found immediately!
    const match = result.match;
    if (!match) {
      throw new Error(
        "Queue manager returned matched status without match data",
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("Match Found!")
      .setDescription(
        `You've been matched with **${match.challengee.name || "your opponent"}**!`,
      )
      .addFields(
        { name: "Format", value: "Constructed", inline: true },
        {
          name: "Your Link",
          value: `[Join Match](${match.joinUrlP1})`,
          inline: true,
        },
      )
      .setFooter({ text: "Check your DMs for the direct link" });

    await interaction.editReply({ embeds: [embed] });

    // Post match announcement in channel (public)
    if (interaction.channel) {
      try {
        const channel = interaction.channel as TextChannel;
        await channel.send(
          `⚔️ **Match Found!** <@${interaction.user.id}> vs **${match.challengee.name || "opponent"}** - Constructed`,
        );
      } catch (err) {
        console.error("[queue] Failed to post match announcement:", err);
      }
    }
    return;
  }

  // Queued successfully
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle("Joined Queue")
    .setDescription("You've joined the constructed matchmaking queue!")
    .addFields(
      { name: "Position", value: `#${result.position}`, inline: true },
      { name: "Queue Size", value: `${result.queueSize}`, inline: true },
    )
    .setFooter({ text: "You'll be notified when a match is found" });

  await interaction.editReply({ embeds: [embed] });

  // If queue was empty, post public announcement to attract opponents
  if (result.wasEmpty && interaction.channel) {
    try {
      const channel = interaction.channel as TextChannel;
      await channel.send(
        `🎮 **${interaction.user.displayName}** is looking for a constructed match! Use \`/queue join\` to play them.`,
      );
    } catch (err) {
      console.error("[queue] Failed to post announcement:", err);
    }
  }
}

async function handleLeave(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { queueManager } = getServices();

  const removed = await queueManager.leaveQueue(interaction.user.id);

  if (removed) {
    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("Left Queue")
      .setDescription("You've been removed from the matchmaking queue.");

    await interaction.editReply({ embeds: [embed] });
  } else {
    const embed = new EmbedBuilder()
      .setColor(0x6b7280)
      .setTitle("Not in Queue")
      .setDescription("You weren't in the matchmaking queue.")
      .addFields({
        name: "Join Queue",
        value: "Use `/queue join` to find an opponent.",
      });

    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { queueManager } = getServices();

  const queueSize = await queueManager.getQueueSize();
  const position = await queueManager.getPlayerPosition(interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle("Queue Status")
    .addFields({
      name: "Players in Queue",
      value: queueSize.toString(),
      inline: true,
    });

  if (position !== null) {
    embed.setDescription("You're currently in the queue!");
    embed.addFields({
      name: "Your Position",
      value: `#${position}`,
      inline: true,
    });
  } else {
    embed.setDescription("You're not in the queue.");
    embed.addFields({
      name: "Join Queue",
      value: "Use `/queue join` to find an opponent.",
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

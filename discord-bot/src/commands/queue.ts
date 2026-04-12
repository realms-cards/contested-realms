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
      sub
        .setName("accept")
        .setDescription("Accept a pending constructed matchmaking offer"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("decline")
        .setDescription("Decline a pending constructed matchmaking offer"),
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
    } else if (subcommand === "accept") {
      await handleAccept(interaction);
    } else if (subcommand === "decline") {
      await handleDecline(interaction);
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
    const match = result.match;
    if (!match) {
      throw new Error(
        "Queue manager returned matched status without match data",
      );
    }

    const embed = new EmbedBuilder()
      .setColor(match.status === "ready" ? 0x22c55e : 0xf59e0b)
      .setTitle(
        match.status === "ready"
          ? "Match Confirmed!"
          : "Match Ready to Confirm",
      )
      .setDescription(
        match.status === "ready"
          ? `You've been matched with **${match.opponentName || "your opponent"}**!`
          : `You've been paired with **${match.opponentName || "your opponent"}**. Accept the match to reserve your seat.`,
      )
      .addFields({ name: "Format", value: "Constructed", inline: true });

    if (match.status === "ready") {
      embed.addFields({
        name: "Your Link",
        value: `[Join Match](${match.joinUrl})`,
        inline: true,
      });
      embed.setFooter({ text: "Check your DMs for the direct link" });
    } else {
      embed.addFields({
        name: "Next Step",
        value:
          "Use `/queue accept` to lock in the match or `/queue decline` to release it.",
        inline: false,
      });
      embed.setFooter({ text: "A confirmation DM has been sent" });
    }

    await interaction.editReply({ embeds: [embed] });

    if (match.status === "ready" && interaction.channel) {
      try {
        const channel = interaction.channel as TextChannel;
        await channel.send(
          `⚔️ **Match Found!** <@${interaction.user.id}> vs **${match.opponentName || "opponent"}** - Constructed`,
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

async function handleAccept(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { queueManager } = getServices();
  const result = await queueManager.acceptPendingMatch(interaction.user.id);

  if (!result.ok) {
    const embed = new EmbedBuilder()
      .setColor(0x6b7280)
      .setTitle("No Pending Match")
      .setDescription(
        "You do not have a pending matchmaking confirmation right now.",
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const match = result.match;
  const embed = new EmbedBuilder().setColor(
    match?.status === "ready" ? 0x22c55e : 0xf59e0b,
  );

  if (!match) {
    embed
      .setTitle("Match Accepted")
      .setDescription("Your confirmation was recorded.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (match.status === "ready") {
    embed
      .setTitle("Match Confirmed!")
      .setDescription(
        `Both players accepted. Your opponent is **${match.opponentName}**.`,
      )
      .addFields({
        name: "Join Match",
        value: `[Open Lobby](${match.joinUrl})`,
        inline: false,
      });
  } else {
    embed
      .setTitle("Match Accepted")
      .setDescription(
        `You're locked in against **${match.opponentName}**. Waiting for the other player to confirm.`,
      )
      .setFooter({ text: "You'll get another DM when the match is ready." });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleDecline(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { queueManager } = getServices();
  const removed = await queueManager.declinePendingMatch(interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor(removed ? 0x22c55e : 0x6b7280)
    .setTitle(removed ? "Match Declined" : "No Pending Match")
    .setDescription(
      removed
        ? "Your pending matchmaking offer was declined and the reservation was released."
        : "You do not have a pending matchmaking confirmation right now.",
    );
  await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { queueManager } = getServices();

  const guildId = interaction.guildId || "";
  const status = await queueManager.getStatus(interaction.user.id, guildId);
  const queueSize = status?.queueSize ?? 0;
  const guildQueueSize = status?.guildQueueSize ?? 0;
  const position = status?.position ?? null;
  const pendingMatch = status?.pendingMatch ?? null;

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle("Queue Status")
    .addFields(
      {
        name: "Players in Queue",
        value: queueSize.toString(),
        inline: true,
      },
      {
        name: "From This Server",
        value: guildQueueSize.toString(),
        inline: true,
      },
    );

  if (pendingMatch) {
    const opponentName =
      pendingMatch.opponentPlayerName ||
      `Player ${pendingMatch.opponentPlayerId.slice(-4)}`;
    embed
      .setColor(pendingMatch.status === "ready" ? 0x22c55e : 0xf59e0b)
      .setDescription(
        pendingMatch.status === "ready"
          ? "Your match is confirmed and ready to join."
          : "You have a pending match confirmation.",
      )
      .addFields(
        { name: "Opponent", value: opponentName, inline: true },
        {
          name: "State",
          value:
            pendingMatch.status === "ready"
              ? "Ready"
              : pendingMatch.youAccepted
                ? "You accepted"
                : "Awaiting your response",
          inline: true,
        },
      );
    if (pendingMatch.status === "confirming") {
      embed.addFields({
        name: "Actions",
        value: "Use `/queue accept` to confirm or `/queue decline` to pass.",
        inline: false,
      });
    } else {
      embed.addFields({
        name: "Join Link",
        value: "Check your DMs for the lobby link.",
        inline: false,
      });
    }
  } else if (position !== null) {
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

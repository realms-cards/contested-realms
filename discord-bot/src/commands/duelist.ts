/**
 * /duelist command - Opt in or out of looking-for-game pings by adding or
 * removing this server's Duelist role.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
} from "discord.js";
import {
  addLfgRole,
  describeRoleFailure,
  removeLfgRole,
  resolveLfgRole,
} from "../services/duelist-role.js";

export const duelistCommand = {
  data: new SlashCommandBuilder()
    .setName("duelist")
    .setDescription("Get pinged when other players are looking for a match")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Give yourself the Duelist role to get match pings"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("leave")
        .setDescription("Remove the Duelist role and stop getting match pings"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Check whether you're set up for match pings"),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: 64 });

    const member = interaction.member;
    if (!interaction.guild || !(member instanceof GuildMember)) {
      await interaction.editReply({
        content: "This command can only be used in a server.",
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "join") {
      await handleJoin(interaction, member);
    } else if (subcommand === "leave") {
      await handleLeave(interaction, member);
    } else if (subcommand === "status") {
      await handleStatus(interaction, member);
    }
  },
};

async function handleJoin(
  interaction: ChatInputCommandInteraction,
  member: GuildMember,
): Promise<void> {
  const result = await addLfgRole(member);

  if (!result.ok) {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("Couldn't Add the Role")
      .setDescription(describeRoleFailure(result.reason, result.role));
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(result.changed ? "You're a Duelist" : "Already a Duelist")
    .setDescription(
      result.changed
        ? `You now have the **${result.role.name}** role and will be pinged when players are looking for a match.`
        : `You already have the **${result.role.name}** role — you're getting match pings.`,
    )
    .addFields({
      name: "Change your mind?",
      value: "Use `/duelist leave` to stop the pings.",
    });

  await interaction.editReply({ embeds: [embed] });
}

async function handleLeave(
  interaction: ChatInputCommandInteraction,
  member: GuildMember,
): Promise<void> {
  const result = await removeLfgRole(member);

  if (!result.ok) {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("Couldn't Remove the Role")
      .setDescription(describeRoleFailure(result.reason, result.role));
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x6b7280)
    .setTitle(result.changed ? "Pings Off" : "Not a Duelist")
    .setDescription(
      result.changed
        ? `Removed the **${result.role.name}** role — you won't be pinged about matches anymore.`
        : `You don't have the **${result.role.name}** role, so you weren't being pinged.`,
    )
    .addFields({
      name: "Back in?",
      value: "Use `/duelist join` whenever you want the pings again.",
    });

  await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  member: GuildMember,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const role = await resolveLfgRole(guild);

  if (!role) {
    const embed = new EmbedBuilder()
      .setColor(0x6b7280)
      .setTitle("Not Set Up")
      .setDescription(
        "This server hasn't set up match pings yet. An admin can run `/lfg-config set channel:#channel`.",
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const hasRole = member.roles.cache.has(role.id);
  const embed = new EmbedBuilder()
    .setColor(hasRole ? 0x22c55e : 0x6b7280)
    .setTitle(hasRole ? "Match Pings On" : "Match Pings Off")
    .addFields(
      { name: "Role", value: role.name, inline: true },
      {
        name: "Status",
        value: hasRole ? "You have it" : "You don't have it",
        inline: true,
      },
      {
        name: hasRole ? "Stop pings" : "Start pings",
        value: hasRole ? "`/duelist leave`" : "`/duelist join`",
      },
    );

  await interaction.editReply({ embeds: [embed] });
}

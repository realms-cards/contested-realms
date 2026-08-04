/**
 * /lfg-config command - Configure where this server gets pinged when a player
 * is looking for a match.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { DEFAULT_ROLE_NAME, findRoleByName } from "../services/duelist-role.js";
import {
  clearGuildLfgConfig,
  getGuildLfgConfig,
  setGuildLfgConfig,
} from "../services/guild-config.js";

export const lfgConfigCommand = {
  data: new SlashCommandBuilder()
    .setName("lfg-config")
    .setDescription(
      "Configure looking-for-game pings for this server (admins only)",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the channel and role pinged when players queue up")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post announcements in")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription(`Role to ping (default: @${DEFAULT_ROLE_NAME})`)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("show").setDescription("Show the current configuration"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Stop looking-for-game pings in this server"),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply({
        content: "This command can only be used in a server.",
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "set") {
      await handleSet(interaction);
    } else if (subcommand === "show") {
      await handleShow(interaction);
    } else if (subcommand === "clear") {
      await handleClear(interaction);
    }
  },
};

async function handleSet(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  const guildId = interaction.guildId;
  if (!guild || !guildId) return;

  const channel = interaction.options.getChannel("channel", true);
  // getRole can hand back a raw APIRole, so resolve it to a guild Role for the
  // position/permission checks below.
  const selected = interaction.options.getRole("role");
  const role = selected
    ? await guild.roles.fetch(selected.id).catch(() => null)
    : await findRoleByName(guild);

  if (!role) {
    const embed = new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("Role Not Found")
      .setDescription(
        selected
          ? `I couldn't look up the **${selected.name}** role in this server.`
          : `No \`role\` was given and this server has no **${DEFAULT_ROLE_NAME}** role.`,
      )
      .addFields({
        name: "Fix",
        value: `Create a **${DEFAULT_ROLE_NAME}** role, or run \`/lfg-config set\` again with the \`role\` option.`,
      });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const me = await guild.members.fetchMe();
  const target = await guild.channels.fetch(channel.id).catch(() => null);
  if (!target?.isTextBased()) {
    await interaction.editReply({
      content: "That channel isn't a text channel I can post in.",
    });
    return;
  }

  const perms = (target as TextChannel).permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply({
      content: `I don't have permission to send messages in <#${channel.id}>.`,
    });
    return;
  }

  await setGuildLfgConfig({
    guildId,
    channelId: channel.id,
    roleId: role.id,
  });

  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle("Looking-for-game Pings Enabled")
    .setDescription(
      `I'll ping ${role} in <#${channel.id}> whenever someone joins the queue or opens a public lobby — from Discord or from the website.`,
    )
    .addFields(
      {
        name: "Members opt in",
        value: `Anyone can run \`/duelist join\` to give themselves **${role.name}**, or \`/duelist leave\` to stop.`,
      },
      {
        name: "Quiet by default",
        value:
          "Each player triggers at most one ping every 15 minutes, and no ping is sent when they're matched instantly.",
      },
    );

  // /duelist can only hand out roles the bot outranks.
  if (
    !me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    role.managed ||
    role.comparePositionTo(me.roles.highest) >= 0
  ) {
    embed.addFields({
      name: "⚠️ Members can't self-assign",
      value: `I can't add **${role.name}** to members, so \`/duelist join\` won't work. Give me "Manage Roles" and move my role above **${role.name}** in Server Settings → Roles.`,
    });
  }

  // A non-mentionable role only pings if the bot may mention all roles.
  if (
    !role.mentionable &&
    !me.permissions.has(PermissionFlagsBits.MentionEveryone)
  ) {
    embed.addFields({
      name: "⚠️ Ping may be silent",
      value: `**${role.name}** isn't mentionable and I lack the "Mention @everyone, @here, and All Roles" permission. Make the role mentionable or grant that permission.`,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleShow(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const config = await getGuildLfgConfig(guildId);

  if (!config) {
    const embed = new EmbedBuilder()
      .setColor(0x6b7280)
      .setTitle("Not Configured")
      .setDescription("This server doesn't get looking-for-game pings.")
      .addFields({
        name: "Enable",
        value: "Run `/lfg-config set channel:#your-channel`.",
      });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle("Looking-for-game Pings")
    .addFields(
      { name: "Channel", value: `<#${config.channelId}>`, inline: true },
      { name: "Role", value: `<@&${config.roleId}>`, inline: true },
    );

  await interaction.editReply({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
}

async function handleClear(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const cleared = await clearGuildLfgConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor(cleared ? 0x22c55e : 0x6b7280)
    .setTitle(cleared ? "Pings Disabled" : "Not Configured")
    .setDescription(
      cleared
        ? "I'll stop posting looking-for-game announcements in this server."
        : "This server wasn't configured for looking-for-game pings.",
    );

  await interaction.editReply({ embeds: [embed] });
}

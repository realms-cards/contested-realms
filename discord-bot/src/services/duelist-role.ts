/**
 * Self-service management of a guild's looking-for-game role (the "Duelist"
 * role by default).
 *
 * Members opt in and out with /duelist; the role that gets pinged is whatever
 * /lfg-config set chose, so the two commands can never drift apart.
 */

import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Role,
} from "discord.js";
import { getGuildLfgConfig } from "./guild-config.js";

export const DEFAULT_ROLE_NAME = "Duelist";

/**
 * Find a role by name, refreshing the cache first so a freshly created role is
 * still found.
 */
export async function findRoleByName(
  guild: Guild,
  name: string = DEFAULT_ROLE_NAME,
): Promise<Role | null> {
  const target = name.toLowerCase();
  const cached = guild.roles.cache.find((r) => r.name.toLowerCase() === target);
  if (cached) return cached;

  const roles = await guild.roles.fetch().catch(() => null);
  return roles?.find((r) => r.name.toLowerCase() === target) ?? null;
}

/**
 * The role this guild pings for looking-for-game announcements: the configured
 * one, else a role named "Duelist".
 */
export async function resolveLfgRole(guild: Guild): Promise<Role | null> {
  const config = await getGuildLfgConfig(guild.id);
  if (config) {
    const role = await guild.roles.fetch(config.roleId).catch(() => null);
    if (role) return role;
  }
  return findRoleByName(guild);
}

export type RoleChangeFailure =
  | "no_role"
  | "missing_permission"
  | "role_not_assignable";

export type RoleChangeResult =
  | { ok: true; role: Role; changed: boolean }
  | { ok: false; reason: RoleChangeFailure; role: Role | null };

/**
 * Why the bot can't hand out this role, or null if it can.
 */
async function checkAssignable(
  guild: Guild,
  role: Role,
): Promise<RoleChangeFailure | null> {
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "missing_permission";
  }
  // Integration-managed roles can never be assigned by a bot, and Discord only
  // allows managing roles below the bot's own highest role.
  if (role.managed || role.comparePositionTo(me.roles.highest) >= 0) {
    return "role_not_assignable";
  }
  return null;
}

export async function hasLfgRole(member: GuildMember): Promise<boolean> {
  const role = await resolveLfgRole(member.guild);
  return role ? member.roles.cache.has(role.id) : false;
}

/**
 * Give a member the looking-for-game role. `changed` is false when they
 * already had it.
 */
export async function addLfgRole(
  member: GuildMember,
  reason = "Opted in to looking-for-game pings",
): Promise<RoleChangeResult> {
  const role = await resolveLfgRole(member.guild);
  if (!role) return { ok: false, reason: "no_role", role: null };

  if (member.roles.cache.has(role.id)) {
    return { ok: true, role, changed: false };
  }

  const blocked = await checkAssignable(member.guild, role);
  if (blocked) return { ok: false, reason: blocked, role };

  await member.roles.add(role, reason);
  return { ok: true, role, changed: true };
}

/**
 * Take the looking-for-game role away. `changed` is false when they didn't
 * have it.
 */
export async function removeLfgRole(
  member: GuildMember,
  reason = "Opted out of looking-for-game pings",
): Promise<RoleChangeResult> {
  const role = await resolveLfgRole(member.guild);
  if (!role) return { ok: false, reason: "no_role", role: null };

  if (!member.roles.cache.has(role.id)) {
    return { ok: true, role, changed: false };
  }

  const blocked = await checkAssignable(member.guild, role);
  if (blocked) return { ok: false, reason: blocked, role };

  await member.roles.remove(role, reason);
  return { ok: true, role, changed: true };
}

/**
 * Player-facing explanation for a failed role change.
 */
export function describeRoleFailure(
  reason: RoleChangeFailure,
  role: Role | null,
): string {
  switch (reason) {
    case "no_role":
      return `This server has no **${DEFAULT_ROLE_NAME}** role yet. An admin can create one and run \`/lfg-config set channel:#channel\`.`;
    case "missing_permission":
      return 'I need the "Manage Roles" permission to do that. Ask an admin to grant it.';
    case "role_not_assignable":
      return role?.managed
        ? `**${role.name}** is managed by an integration, so I can't assign it. An admin should pick a normal role with \`/lfg-config set\`.`
        : `My own role sits below **${role?.name ?? "that role"}**, so I can't assign it. An admin needs to move my role higher in Server Settings → Roles.`;
  }
}

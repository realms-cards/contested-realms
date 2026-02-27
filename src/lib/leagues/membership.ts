/**
 * League Membership Service
 *
 * Manages league memberships based on Discord guild membership.
 * When a user links Discord, their guilds are cross-referenced against
 * known leagues to automatically create/remove memberships.
 */

import { prisma } from "@/lib/prisma";

export interface LeagueInfo {
  id: string;
  slug: string;
  name: string;
  badgeColor: string | null;
  iconUrl: string | null;
}

export interface LeagueMembershipInfo extends LeagueInfo {
  joinedAt: Date;
}

/**
 * Sync a user's league memberships based on their Discord guild list.
 * Creates memberships for matching guilds and removes stale ones.
 */
export async function syncLeagueMemberships(
  userId: string,
  guildIds: string[],
): Promise<LeagueMembershipInfo[]> {
  // Find all enabled leagues whose Discord guild ID matches the user's guilds
  const matchingLeagues = await prisma.league.findMany({
    where: {
      discordGuildId: { in: guildIds },
      enabled: true,
    },
  });

  const matchingLeagueIds = new Set(matchingLeagues.map((l) => l.id));

  // Get existing memberships for this user
  const existingMemberships = await prisma.leagueMembership.findMany({
    where: { userId },
    include: { league: true },
  });

  const existingLeagueIds = new Set(existingMemberships.map((m) => m.leagueId));

  // Determine which to create and which to remove
  const toCreate = matchingLeagues.filter((l) => !existingLeagueIds.has(l.id));
  const toRemove = existingMemberships.filter(
    (m) => !matchingLeagueIds.has(m.leagueId),
  );

  // Batch operations in a transaction
  if (toCreate.length > 0 || toRemove.length > 0) {
    await prisma.$transaction([
      // Remove stale memberships
      ...(toRemove.length > 0
        ? [
            prisma.leagueMembership.deleteMany({
              where: {
                id: { in: toRemove.map((m) => m.id) },
              },
            }),
          ]
        : []),
      // Create new memberships
      ...toCreate.map((league) =>
        prisma.leagueMembership.create({
          data: { userId, leagueId: league.id },
        }),
      ),
    ]);
  }

  // Return the current state
  const updated = await prisma.leagueMembership.findMany({
    where: { userId },
    include: { league: true },
  });

  return updated.map((m) => ({
    id: m.league.id,
    slug: m.league.slug,
    name: m.league.name,
    badgeColor: m.league.badgeColor,
    iconUrl: m.league.iconUrl,
    joinedAt: m.joinedAt,
  }));
}

/**
 * Get all leagues a user belongs to.
 */
export async function getUserLeagues(
  userId: string,
): Promise<LeagueMembershipInfo[]> {
  const memberships = await prisma.leagueMembership.findMany({
    where: { userId },
    include: { league: true },
  });

  return memberships.map((m) => ({
    id: m.league.id,
    slug: m.league.slug,
    name: m.league.name,
    badgeColor: m.league.badgeColor,
    iconUrl: m.league.iconUrl,
    joinedAt: m.joinedAt,
  }));
}

/**
 * Get leagues shared between two users (for match reporting).
 */
export async function getSharedLeagues(
  userId1: string,
  userId2: string,
): Promise<LeagueInfo[]> {
  // Find leagues where both users are members
  const user1Leagues = await prisma.leagueMembership.findMany({
    where: { userId: userId1 },
    select: { leagueId: true },
  });
  const user1LeagueIds = user1Leagues.map((m) => m.leagueId);

  if (user1LeagueIds.length === 0) return [];

  const sharedMemberships = await prisma.leagueMembership.findMany({
    where: {
      userId: userId2,
      leagueId: { in: user1LeagueIds },
    },
    include: { league: true },
  });

  return sharedMemberships
    .filter((m) => m.league.enabled)
    .map((m) => ({
      id: m.league.id,
      slug: m.league.slug,
      name: m.league.name,
      badgeColor: m.league.badgeColor,
      iconUrl: m.league.iconUrl,
    }));
}

/**
 * Batch fetch league memberships for multiple users (for badge display).
 */
export async function getLeaguesForUsers(
  userIds: string[],
): Promise<Record<string, LeagueInfo[]>> {
  if (userIds.length === 0) return {};

  const memberships = await prisma.leagueMembership.findMany({
    where: { userId: { in: userIds } },
    include: { league: true },
  });

  const result: Record<string, LeagueInfo[]> = {};
  for (const uid of userIds) {
    result[uid] = [];
  }

  for (const m of memberships) {
    if (!m.league.enabled) continue;
    const entry: LeagueInfo = {
      id: m.league.id,
      slug: m.league.slug,
      name: m.league.name,
      badgeColor: m.league.badgeColor,
      iconUrl: m.league.iconUrl,
    };
    if (!result[m.userId]) {
      result[m.userId] = [];
    }
    result[m.userId].push(entry);
  }

  return result;
}

/**
 * Remove all league memberships for a user (used when unlinking Discord).
 */
export async function removeAllMemberships(userId: string): Promise<void> {
  await prisma.leagueMembership.deleteMany({
    where: { userId },
  });
}

/**
 * Check which known league guilds a Discord user belongs to using the bot token,
 * then sync their memberships. This works for users who linked Discord via bot
 * (without OAuth guild scope).
 *
 * Requires DISCORD_BOT_TOKEN env var and the bot to be in the league guilds.
 */
export async function syncLeagueMembershipsViaBotCheck(
  userId: string,
  discordId: string,
): Promise<LeagueMembershipInfo[]> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    console.warn("[league-membership] DISCORD_BOT_TOKEN not set, skipping bot guild check");
    return [];
  }

  // Get all enabled leagues with Discord guild IDs
  const leagues = await prisma.league.findMany({
    where: { enabled: true },
    select: { id: true, discordGuildId: true },
  });

  if (leagues.length === 0) return [];

  // Check each guild in parallel using the bot token
  const memberGuildIds: string[] = [];
  await Promise.all(
    leagues.map(async (league) => {
      try {
        const res = await fetch(
          `https://discord.com/api/v10/guilds/${league.discordGuildId}/members/${discordId}`,
          {
            headers: { Authorization: `Bot ${botToken}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        if (res.ok) {
          memberGuildIds.push(league.discordGuildId);
        }
        // 404 = not a member, other errors = skip silently
      } catch {
        // Network errors are non-fatal
      }
    }),
  );

  // Sync using the found guild IDs
  return syncLeagueMemberships(userId, memberGuildIds);
}

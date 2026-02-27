/**
 * Discord Guild Fetcher
 *
 * Fetches a user's Discord guild IDs using multiple strategies:
 * 1. Stored guild IDs on User record (from OAuth)
 * 2. Account access_token (from NextAuth Discord sign-in, with refresh)
 * 3. Bot token check for specific guilds where the bot is present
 *
 * Returns the guild IDs and updates the stored data if refreshed.
 */

import { prisma } from "@/lib/prisma";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Realms.cards Discord server — the bot is always here
const REALMS_DISCORD_GUILD_ID = "1226910297877385268";

interface DiscordGuild {
  id: string;
}

/**
 * Try to fetch guilds using a Discord access token.
 * Returns guild IDs or null if the token is expired/invalid.
 */
async function fetchGuildsWithToken(accessToken: string): Promise<string[] | null> {
  try {
    const res = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const guilds = (await res.json()) as DiscordGuild[];
      return guilds.map((g) => g.id);
    }
    // 401 = token expired/invalid
    return null;
  } catch {
    return null;
  }
}

/**
 * Refresh a Discord access token using the refresh_token.
 * Returns new access_token or null.
 */
async function refreshDiscordToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_at: number } | null> {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) return null;
  try {
    const res = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a Discord user is in a specific guild using the bot token.
 */
async function checkGuildMembershipViaBot(
  guildId: string,
  discordId: string,
): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN) return false;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
      {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch Discord guild IDs for a user using all available strategies.
 * Updates stored guild IDs on the User record if refreshed.
 *
 * Strategy order:
 * 1. Try Account access_token (freshest data, works for NextAuth Discord sign-in)
 * 2. Fall back to stored guild IDs on User record
 * 3. For guilds where the bot is present, check via bot token
 */
export async function fetchUserGuildIds(
  userId: string,
  discordId: string,
): Promise<string[]> {
  // Strategy 1: Try the Discord Account access_token
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (account?.access_token) {
    const now = Math.floor(Date.now() / 1000);
    const isExpired = account.expires_at ? account.expires_at < now : false;

    let guildIds: string[] | null = null;

    if (!isExpired) {
      // Try current token
      guildIds = await fetchGuildsWithToken(account.access_token);
    }

    // If expired or fetch failed, try refresh
    if (!guildIds && account.refresh_token) {
      const refreshed = await refreshDiscordToken(account.refresh_token);
      if (refreshed) {
        // Update stored tokens
        await prisma.account.update({
          where: { id: account.id },
          data: {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: refreshed.expires_at,
          },
        });
        guildIds = await fetchGuildsWithToken(refreshed.access_token);
      }
    }

    if (guildIds && guildIds.length > 0) {
      // Update stored guild IDs on User for future reference
      await prisma.user.update({
        where: { id: userId },
        data: { discordGuildIds: JSON.stringify(guildIds) },
      });
      return guildIds;
    }
  }

  // Strategy 2: Use stored guild IDs from User record
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordGuildIds: true },
  });

  if (user?.discordGuildIds) {
    try {
      const parsed: unknown = JSON.parse(user.discordGuildIds);
      if (Array.isArray(parsed)) {
        const stored = parsed.filter((id): id is string => typeof id === "string");
        if (stored.length > 0) return stored;
      }
    } catch {
      // Invalid JSON, continue to fallback
    }
  }

  // Strategy 3: Bot token check for known guild(s)
  // The bot is in the Realms.cards Discord — check there at minimum
  const botGuilds: string[] = [];

  // Check all enabled league guilds + Realms.cards guild
  const leagues = await prisma.league.findMany({
    where: { enabled: true },
    select: { discordGuildId: true },
  });

  const guildIdsToCheck = new Set<string>();
  guildIdsToCheck.add(REALMS_DISCORD_GUILD_ID);
  for (const league of leagues) {
    guildIdsToCheck.add(league.discordGuildId);
  }

  await Promise.all(
    Array.from(guildIdsToCheck).map(async (guildId) => {
      if (await checkGuildMembershipViaBot(guildId, discordId)) {
        botGuilds.push(guildId);
      }
    }),
  );

  if (botGuilds.length > 0) {
    // Store what we found via bot
    await prisma.user.update({
      where: { id: userId },
      data: { discordGuildIds: JSON.stringify(botGuilds) },
    });
  }

  return botGuilds;
}

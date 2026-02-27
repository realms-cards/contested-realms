/**
 * GET /api/discord/callback
 * Handles the Discord OAuth2 callback for account linking.
 * Exchanges the code for an access token, fetches user info and guilds,
 * links Discord to the authenticated user, and syncs league memberships.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { syncLeagueMemberships } from "@/lib/leagues/membership";
import { prisma } from "@/lib/prisma";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
}

interface DiscordGuild {
  id: string;
  name: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle user denying the OAuth request
  if (error) {
    return NextResponse.redirect(
      `${NEXTAUTH_URL}/settings/discord?error=oauth_denied`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${NEXTAUTH_URL}/settings/discord?error=missing_params`,
    );
  }

  // Validate CSRF state token
  const cookieStore = await cookies();
  const storedState = cookieStore.get("discord_oauth_state")?.value;
  cookieStore.delete("discord_oauth_state");

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      `${NEXTAUTH_URL}/settings/discord?error=invalid_state`,
    );
  }

  // Verify user is authenticated
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(
      `${NEXTAUTH_URL}/settings/discord?error=not_authenticated`,
    );
  }

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    return NextResponse.redirect(
      `${NEXTAUTH_URL}/settings/discord?error=not_configured`,
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${NEXTAUTH_URL}/api/discord/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      console.error(
        "[discord/callback] Token exchange failed:",
        await tokenResponse.text(),
      );
      return NextResponse.redirect(
        `${NEXTAUTH_URL}/settings/discord?error=token_exchange`,
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      token_type: string;
    };
    const accessToken = tokenData.access_token;

    // Fetch Discord user info and guilds in parallel
    const [userResponse, guildsResponse] = await Promise.all([
      fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    if (!userResponse.ok) {
      console.error(
        "[discord/callback] User fetch failed:",
        await userResponse.text(),
      );
      return NextResponse.redirect(
        `${NEXTAUTH_URL}/settings/discord?error=user_fetch`,
      );
    }

    const discordUser = (await userResponse.json()) as DiscordUser;
    const discordId = discordUser.id;
    const discordUsername =
      discordUser.global_name || discordUser.username || discordUser.username;

    // Parse guilds (may fail if scope wasn't granted, that's ok)
    let guildIds: string[] = [];
    if (guildsResponse.ok) {
      const guilds = (await guildsResponse.json()) as DiscordGuild[];
      guildIds = guilds.map((g) => g.id);
    }

    // Check if this Discord ID is already linked to another user
    const existingUser = await prisma.user.findUnique({
      where: { discordId },
      select: { id: true },
    });

    if (existingUser && existingUser.id !== session.user.id) {
      return NextResponse.redirect(
        `${NEXTAUTH_URL}/settings/discord?error=already_linked_other`,
      );
    }

    // Check if current user already has a different Discord linked
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { discordId: true },
    });

    if (currentUser?.discordId && currentUser.discordId !== discordId) {
      return NextResponse.redirect(
        `${NEXTAUTH_URL}/settings/discord?error=already_linked_self`,
      );
    }

    // Link Discord to user
    await prisma.user.update({
      where: { id: session.user.id },
      data: { discordId, discordUsername },
    });

    // Sync league memberships based on guild list
    if (guildIds.length > 0) {
      await syncLeagueMemberships(session.user.id, guildIds);
    }

    return NextResponse.redirect(
      `${NEXTAUTH_URL}/settings/discord?success=true`,
    );
  } catch (err) {
    console.error("[discord/callback] Error:", err);
    return NextResponse.redirect(
      `${NEXTAUTH_URL}/settings/discord?error=internal`,
    );
  }
}

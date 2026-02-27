/**
 * GET /api/discord/oauth
 * Returns a Discord OAuth2 authorization URL for linking Discord from settings.
 * This is separate from NextAuth's Discord sign-in — it links Discord to an
 * already-authenticated user and requests the `guilds` scope.
 */

import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  if (!DISCORD_CLIENT_ID) {
    return NextResponse.json(
      { error: "Discord OAuth not configured" },
      { status: 500 },
    );
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString("hex");

  // Store state in a cookie for validation in the callback
  const cookieStore = await cookies();
  cookieStore.set("discord_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const redirectUri = `${NEXTAUTH_URL}/api/discord/callback`;
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
  });

  const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

  return NextResponse.json({ url: authUrl });
}

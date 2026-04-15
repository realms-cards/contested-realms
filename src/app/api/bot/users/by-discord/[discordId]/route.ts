/**
 * GET /api/bot/users/by-discord/:discordId
 * Look up a user by their Discord ID.
 * Used by the Discord bot to check if a user has linked their account.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth, botAuthError } from "@/lib/bot-auth";
import { removeAllMemberships } from "@/lib/leagues/membership";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

const PLAYER_STATE_FRESH_MS = 2 * 60 * 1000;

async function getOnlineStatus(userId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const state = await redis.hgetall(`player:${userId}`);
    if (!state || Object.keys(state).length === 0) {
      return false;
    }

    const lastSeen = Number(state.lastSeen);
    if (!Number.isFinite(lastSeen)) {
      return false;
    }

    return Date.now() - lastSeen <= PLAYER_STATE_FRESH_MS;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  const { discordId } = await params;

  if (!discordId) {
    return NextResponse.json(
      { error: "Discord ID is required" },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: {
        id: true,
        name: true,
        image: true,
        shortId: true,
        discordId: true,
        discordUsername: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const online = await getOnlineStatus(user.id);

    return NextResponse.json({
      id: user.id,
      name: user.name || user.discordUsername || "Unknown",
      image: user.image,
      shortId: user.shortId,
      discordId: user.discordId,
      online,
    });
  } catch (error) {
    console.error("[bot/users/by-discord] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  const { discordId } = await params;

  if (!discordId) {
    return NextResponse.json(
      { error: "Discord ID is required" },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await removeAllMemberships(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { discordId: null, discordUsername: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[bot/users/by-discord] Unlink error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

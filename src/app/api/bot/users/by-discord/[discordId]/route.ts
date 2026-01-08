/**
 * GET /api/bot/users/by-discord/:discordId
 * Look up a user by their Discord ID.
 * Used by the Discord bot to check if a user has linked their account.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth, botAuthError } from "@/lib/bot-auth";
import { prisma } from "@/lib/prisma";

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

    return NextResponse.json({
      id: user.id,
      name: user.name || user.discordUsername || "Unknown",
      image: user.image,
      shortId: user.shortId,
      discordId: user.discordId,
      online: false, // TODO: Check Redis for online status
    });
  } catch (error) {
    console.error("[bot/users/by-discord] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

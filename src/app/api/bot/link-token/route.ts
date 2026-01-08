/**
 * POST /api/bot/link-token
 * Create a link token for Discord account linking.
 * The bot calls this when a user runs /link start.
 */

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth, botAuthError } from "@/lib/bot-auth";
import { prisma } from "@/lib/prisma";

const LINK_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  try {
    const body = await request.json();
    const { discordId, discordTag, guildId } = body;

    if (!discordId || !discordTag) {
      return NextResponse.json(
        { error: "discordId and discordTag are required" },
        { status: 400 }
      );
    }

    // Check if already linked
    const existingUser = await prisma.user.findUnique({
      where: { discordId },
      select: { id: true, name: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Discord account already linked", userId: existingUser.id },
        { status: 409 }
      );
    }

    // Generate unique token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + LINK_TOKEN_EXPIRY_MS);

    // Create link token
    await prisma.discordLinkToken.create({
      data: {
        token,
        discordId,
        discordTag,
        guildId: guildId || null,
        expiresAt,
      },
    });

    // Build link URL
    const baseUrl = process.env.NEXTAUTH_URL || "https://realms.cards";
    const linkUrl = `${baseUrl}/discord/link?token=${token}`;

    return NextResponse.json({
      linkUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[bot/link-token] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

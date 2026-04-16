/**
 * POST /api/bot/challenges/:id/accept
 * Accept a challenge and create a match lobby.
 */

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth, botAuthError } from "@/lib/bot-auth";
import { buildLobbyInviteUrl } from "@/lib/lobby-links";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  const { id } = await params;

  try {
    // Get challenge
    const challenge = await prisma.discordChallenge.findUnique({
      where: { id },
    });

    if (!challenge) {
      return NextResponse.json(
        { error: "Challenge not found" },
        { status: 404 },
      );
    }

    if (challenge.status !== "pending") {
      return NextResponse.json(
        { error: `Challenge already ${challenge.status}` },
        { status: 400 },
      );
    }

    if (challenge.expiresAt < new Date()) {
      await prisma.discordChallenge.update({
        where: { id },
        data: { status: "expired" },
      });
      return NextResponse.json(
        { error: "Challenge has expired" },
        { status: 410 },
      );
    }

    // Look up both users to get their realms IDs
    const [challenger, challengee] = await Promise.all([
      prisma.user.findUnique({
        where: { discordId: challenge.challengerId },
        select: { id: true, name: true, shortId: true },
      }),
      prisma.user.findUnique({
        where: { discordId: challenge.challengeeId },
        select: { id: true, name: true, shortId: true },
      }),
    ]);

    if (!challenger || !challengee) {
      return NextResponse.json(
        { error: "One or both users no longer have linked accounts" },
        { status: 404 },
      );
    }

    // Generate a unique lobby ID for the match
    const lobbyId = `discord-${randomBytes(8).toString("hex")}`;
    const baseUrl = process.env.NEXTAUTH_URL || "https://realms.cards";

    // Update challenge status
    await prisma.discordChallenge.update({
      where: { id },
      data: {
        status: "accepted",
        matchId: lobbyId,
        respondedAt: new Date(),
      },
    });

    const joinUrl = buildLobbyInviteUrl(baseUrl, lobbyId, {
      format: challenge.format,
    });

    return NextResponse.json({
      matchId: lobbyId,
      lobbyId,
      joinUrl,
      format: challenge.format,
      challenger: {
        id: challenger.id,
        name: challenger.name,
        shortId: challenger.shortId,
      },
      challengee: {
        id: challengee.id,
        name: challengee.name,
        shortId: challengee.shortId,
      },
    });
  } catch (error) {
    console.error("[bot/challenges/accept] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/bot/challenges/pending/:discordId
 * Get pending challenges for a Discord user.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth, botAuthError } from "@/lib/bot-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ discordId: string }> },
) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  const { discordId } = await params;

  try {
    // Return the most recent pending challenge for this user
    const challenge = await prisma.discordChallenge.findFirst({
      where: {
        OR: [{ challengerId: discordId }, { challengeeId: discordId }],
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) {
      return NextResponse.json(
        { error: "No pending challenges found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: challenge.id,
      challengerId: challenge.challengerId,
      challengeeId: challenge.challengeeId,
      format: challenge.format,
      status: challenge.status,
      matchId: challenge.matchId,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[bot/challenges/pending] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

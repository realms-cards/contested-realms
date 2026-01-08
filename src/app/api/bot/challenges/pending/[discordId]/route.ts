/**
 * GET /api/bot/challenges/pending/:discordId
 * Get pending challenges for a Discord user.
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

  try {
    const challenges = await prisma.discordChallenge.findMany({
      where: {
        OR: [{ challengerId: discordId }, { challengeeId: discordId }],
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      challenges: challenges.map((c) => ({
        id: c.id,
        challengerId: c.challengerId,
        challengeeId: c.challengeeId,
        format: c.format,
        expiresAt: c.expiresAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[bot/challenges/pending] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

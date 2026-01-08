/**
 * POST /api/bot/challenges/:id/decline
 * Decline a challenge.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth, botAuthError } from "@/lib/bot-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  const { id } = await params;

  try {
    const challenge = await prisma.discordChallenge.findUnique({
      where: { id },
    });

    if (!challenge) {
      return NextResponse.json(
        { error: "Challenge not found" },
        { status: 404 }
      );
    }

    if (challenge.status !== "pending") {
      return NextResponse.json(
        { error: `Challenge already ${challenge.status}` },
        { status: 400 }
      );
    }

    await prisma.discordChallenge.update({
      where: { id },
      data: {
        status: "declined",
        respondedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[bot/challenges/decline] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

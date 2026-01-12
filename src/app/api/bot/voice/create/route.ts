/**
 * POST /api/bot/voice/create
 * Create a voice channel for a match.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth } from "@/lib/bot-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Validate bot authentication
  if (!validateBotAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { matchId, player1Id, player2Id } = body;

    if (!matchId || !player1Id || !player2Id) {
      return NextResponse.json(
        { error: "Missing required fields: matchId, player1Id, player2Id" },
        { status: 400 }
      );
    }

    // Get both users with their Discord IDs
    const [player1, player2] = await Promise.all([
      prisma.user.findUnique({
        where: { id: player1Id },
        select: { id: true, name: true, discordId: true },
      }),
      prisma.user.findUnique({
        where: { id: player2Id },
        select: { id: true, name: true, discordId: true },
      }),
    ]);

    if (!player1 || !player2) {
      return NextResponse.json(
        { error: "One or both players not found" },
        { status: 404 }
      );
    }

    if (!player1.discordId || !player2.discordId) {
      return NextResponse.json(
        {
          error: "One or both players do not have Discord linked",
          player1Linked: !!player1.discordId,
          player2Linked: !!player2.discordId,
        },
        { status: 400 }
      );
    }

    // Return player info for bot to create channel
    return NextResponse.json({
      matchId,
      player1: {
        id: player1.id,
        name: player1.name || "Player 1",
        discordId: player1.discordId,
      },
      player2: {
        id: player2.id,
        name: player2.name || "Player 2",
        discordId: player2.discordId,
      },
    });
  } catch (error) {
    console.error("[bot/voice/create] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

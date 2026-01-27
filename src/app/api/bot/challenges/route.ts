/**
 * POST /api/bot/challenges
 * Create a new match challenge between two Discord users.
 */

import { GameFormat } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth, botAuthError } from "@/lib/bot-auth";
import { prisma } from "@/lib/prisma";

const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  try {
    const body = await request.json();
    const {
      challengerDiscordId,
      challengeeDiscordId,
      format,
      guildId,
      channelId,
    } = body;

    if (!challengerDiscordId || !challengeeDiscordId) {
      return NextResponse.json(
        { error: "challengerDiscordId and challengeeDiscordId are required" },
        { status: 400 },
      );
    }

    // Validate format
    const validFormats: GameFormat[] = ["constructed", "sealed", "draft"];
    const gameFormat: GameFormat = validFormats.includes(format)
      ? format
      : "constructed";

    // Look up both users
    const [challenger, challengee] = await Promise.all([
      prisma.user.findUnique({
        where: { discordId: challengerDiscordId },
        select: { id: true, name: true },
      }),
      prisma.user.findUnique({
        where: { discordId: challengeeDiscordId },
        select: { id: true, name: true },
      }),
    ]);

    if (!challenger) {
      return NextResponse.json(
        { error: "Challenger has not linked their Discord account" },
        { status: 404 },
      );
    }

    if (!challengee) {
      return NextResponse.json(
        { error: "Challenged user has not linked their Discord account" },
        { status: 404 },
      );
    }

    // Check for existing pending challenge
    const existingChallenge = await prisma.discordChallenge.findFirst({
      where: {
        challengerId: challengerDiscordId,
        challengeeId: challengeeDiscordId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });

    if (existingChallenge) {
      return NextResponse.json(
        {
          error: "A pending challenge already exists",
          challengeId: existingChallenge.id,
        },
        { status: 409 },
      );
    }

    // Create challenge
    const challenge = await prisma.discordChallenge.create({
      data: {
        challengerId: challengerDiscordId,
        challengeeId: challengeeDiscordId,
        format: gameFormat,
        guildId: guildId || null,
        channelId: channelId || null,
        expiresAt: new Date(Date.now() + CHALLENGE_EXPIRY_MS),
      },
    });

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
    console.error("[bot/challenges] Create error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

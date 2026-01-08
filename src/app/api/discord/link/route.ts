/**
 * POST /api/discord/link
 * Complete the Discord account linking process.
 * Called by the web UI when user visits the link page while authenticated.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Find the link token
    const linkToken = await prisma.discordLinkToken.findUnique({
      where: { token },
    });

    if (!linkToken) {
      return NextResponse.json(
        { error: "Invalid or already used link token" },
        { status: 400 }
      );
    }

    if (linkToken.usedAt) {
      return NextResponse.json(
        { error: "This link has already been used" },
        { status: 400 }
      );
    }

    if (linkToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This link has expired" },
        { status: 410 }
      );
    }

    // Check if this Discord ID is already linked to another user
    const existingDiscordUser = await prisma.user.findUnique({
      where: { discordId: linkToken.discordId },
    });

    if (existingDiscordUser && existingDiscordUser.id !== session.user.id) {
      return NextResponse.json(
        { error: "This Discord account is already linked to another user" },
        { status: 409 }
      );
    }

    // Check if current user already has a different Discord linked
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { discordId: true },
    });

    if (
      currentUser?.discordId &&
      currentUser.discordId !== linkToken.discordId
    ) {
      return NextResponse.json(
        {
          error:
            "Your account is already linked to a different Discord account. Please unlink it first.",
        },
        { status: 409 }
      );
    }

    // Link the accounts
    await prisma.$transaction([
      // Update user with Discord info
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          discordId: linkToken.discordId,
          discordUsername: linkToken.discordTag,
        },
      }),
      // Mark token as used
      prisma.discordLinkToken.update({
        where: { id: linkToken.id },
        data: {
          usedAt: new Date(),
          userId: session.user.id,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      discordId: linkToken.discordId,
      discordTag: linkToken.discordTag,
    });
  } catch (error) {
    console.error("[discord/link] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { botAuthError, validateBotAuth } from "@/lib/bot-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!validateBotAuth(request)) {
    return botAuthError();
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "User ID is required" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true,
        discordId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      image: user.image,
      discordId: user.discordId,
      online: false,
    });
  } catch (error) {
    console.error("[bot/users/:userId] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

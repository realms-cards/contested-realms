/**
 * POST /api/bot/voice/delete
 * Delete a voice channel for a match.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateBotAuth } from "@/lib/bot-auth";

export async function POST(request: NextRequest) {
  // Validate bot authentication
  if (!validateBotAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json(
        { error: "Missing required field: matchId" },
        { status: 400 }
      );
    }

    // Just acknowledge - bot will handle the actual deletion
    return NextResponse.json({ success: true, matchId });
  } catch (error) {
    console.error("[bot/voice/delete] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

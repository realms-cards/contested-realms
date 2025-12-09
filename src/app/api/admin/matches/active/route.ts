import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import type { ActiveMatchInfo } from "@/lib/admin/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/matches/active
 * Returns list of currently active matches from the Socket.IO server (admin only)
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();

    // Get the WebSocket server URL
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
    const baseUrl = wsUrl.replace(/^wss?:\/\//, "http://").replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/matches/active`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        `[admin] Active matches fetch failed: ${response.status} ${response.statusText}`
      );
      return NextResponse.json(
        { error: "Failed to fetch active matches from server" },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      matches: ActiveMatchInfo[];
      total: number;
    };

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] active matches list failed:", error);
    return NextResponse.json(
      { error: "Failed to load active matches" },
      { status: 500 }
    );
  }
}

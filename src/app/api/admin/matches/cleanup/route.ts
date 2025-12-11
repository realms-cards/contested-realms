import { NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/matches/cleanup
 * Cleanup a stale match (admin only, for matches older than 2 days)
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();

    const body = (await request.json()) as { matchId?: string };
    const matchId = body?.matchId;

    if (!matchId || typeof matchId !== "string") {
      return NextResponse.json({ error: "Missing matchId" }, { status: 400 });
    }

    // Get the WebSocket server URL
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
    const baseUrl = wsUrl.replace(/^wss?:\/\//, "http://").replace(/\/$/, "");

    const response = await fetch(`${baseUrl}/matches/cleanup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ matchId }),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      console.error(
        `[admin] Cleanup match failed: ${response.status} ${response.statusText}`
      );
      return NextResponse.json(
        { error: errorBody?.error || "Failed to cleanup match" },
        { status: response.status }
      );
    }

    const data = (await response.json()) as {
      success: boolean;
      matchId: string;
    };
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    console.error("[admin] cleanup match failed:", error);
    return NextResponse.json(
      { error: "Failed to cleanup match" },
      { status: 500 }
    );
  }
}

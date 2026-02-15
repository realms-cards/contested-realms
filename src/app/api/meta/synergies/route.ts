import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "all";

    // Try serving from pre-computed cache
    const snapshot = await prisma.metaStatsSnapshot.findUnique({
      where: { key: `synergies:${format}` },
    });
    if (snapshot) {
      const cached = snapshot.data as Record<string, unknown>;
      return NextResponse.json({
        ...cached,
        generatedAt: snapshot.computedAt.toISOString(),
      });
    }

    // No cache available — return empty (synergies are only computed server-side)
    return NextResponse.json({
      synergies: [],
      antiSynergies: [],
      popular: [],
      format,
      totalDecks: 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load synergy stats:", error);
    return NextResponse.json(
      { error: "Failed to load synergy stats" },
      { status: 500 },
    );
  }
}

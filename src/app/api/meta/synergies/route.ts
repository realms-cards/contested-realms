import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PairEntry = {
  cardA: string;
  cardB: string;
  slugA: string | null;
  slugB: string | null;
  coOccurrences: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

const DRILL_DOWN_LIMIT = 20;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "all";
    const cardFilter = url.searchParams.get("card");

    // Try serving from pre-computed cache
    const snapshot = await prisma.metaStatsSnapshot.findUnique({
      where: { key: `synergies:${format}` },
    });

    if (snapshot) {
      const cached = snapshot.data as Record<string, unknown>;

      // Per-card drill-down: filter allPairs for the given card
      if (cardFilter) {
        const allPairs = (cached.allPairs as PairEntry[] | undefined) || [];
        const matching = allPairs.filter(
          (p) => p.cardA === cardFilter || p.cardB === cardFilter,
        );
        const synergies = [...matching]
          .sort((a, b) => b.winRate - a.winRate || b.coOccurrences - a.coOccurrences)
          .slice(0, DRILL_DOWN_LIMIT);
        const antiSynergies = [...matching]
          .sort((a, b) => a.winRate - b.winRate || b.coOccurrences - a.coOccurrences)
          .slice(0, DRILL_DOWN_LIMIT);

        return NextResponse.json({
          card: cardFilter,
          synergies,
          antiSynergies,
          totalPairs: matching.length,
          format,
          generatedAt: snapshot.computedAt.toISOString(),
        });
      }

      // Overview: return top-50 lists (exclude allPairs from response to save bandwidth)
      const { allPairs: _unused, ...rest } = cached;
      void _unused;
      return NextResponse.json({
        ...rest,
        generatedAt: snapshot.computedAt.toISOString(),
      });
    }

    // No cache available — return empty (synergies are only computed server-side)
    if (cardFilter) {
      return NextResponse.json({
        card: cardFilter,
        synergies: [],
        antiSynergies: [],
        totalPairs: 0,
        format,
        generatedAt: new Date().toISOString(),
      });
    }

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

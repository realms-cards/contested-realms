import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/sets
 * Returns all sets that have pack configurations (i.e., draftable sets).
 * Query params:
 *   - draftable=true (default) - only sets with PackConfig
 *   - draftable=false - all sets
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const draftableOnly = url.searchParams.get("draftable") !== "false";

    const sets = await prisma.set.findMany({
      where: draftableOnly ? { packConfig: { isNot: null } } : undefined,
      select: {
        id: true,
        name: true,
        releasedAt: true,
        packConfig: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { releasedAt: "desc" },
    });

    // Transform to simpler format
    const result = sets.map((s: (typeof sets)[number]) => ({
      id: s.id,
      name: s.name,
      releasedAt: s.releasedAt?.toISOString() ?? null,
      hasPacks: !!s.packConfig,
    }));

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[API /sets] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sets" },
      { status: 500 }
    );
  }
}

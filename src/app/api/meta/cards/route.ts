import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOrder(raw: string | null): "plays" | "wins" | "winRate" {
  if (raw === "wins") return "wins";
  if (raw === "winRate") return "winRate";
  return "plays";
}

function parseFormat(raw: string | null): "constructed" | "sealed" | "draft" {
  if (raw === "sealed") return "sealed";
  if (raw === "draft") return "draft";
  return "constructed";
}

type HumanCardStatRow = {
  cardId: number;
  plays: number;
  wins: number;
  losses: number;
  draws: number;
};
type HumanCardStatOut = HumanCardStatRow & {
  name: string;
  winRate: number;
  slug: string | null;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(1, Math.floor(limitRaw)), 200)
      : 50;
    const order = parseOrder(url.searchParams.get("order"));
    const format = parseFormat(url.searchParams.get("format"));

    const client = prisma as unknown as Record<string, unknown>;
    const model = client["humanCardStats"] as {
      findMany: (args: {
        where: { format: string };
        take: number;
        orderBy: Record<string, "asc" | "desc">;
        select?: Record<string, boolean>;
      }) => Promise<HumanCardStatRow[]>;
    };
    const rows = await model.findMany({
      where: { format },
      take: limit,
      orderBy:
        order === "plays"
          ? { plays: "desc" }
          : order === "wins"
          ? { wins: "desc" }
          : { plays: "desc" },
      select: {
        cardId: true,
        plays: true,
        wins: true,
        losses: true,
        draws: true,
      },
    });

    // Filter out cardId 0 (invalid/placeholder)
    const validRows = rows.filter((r) => r.cardId > 0);
    const ids = validRows.map((r) => r.cardId);
    const cards = ids.length
      ? await prisma.card.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(
      cards.map((c: { id: number; name: string }) => [c.id, c.name] as const)
    );

    // Fetch slugs for card previews (get first variant for each card)
    const variants = ids.length
      ? await prisma.variant.findMany({
          where: { cardId: { in: ids } },
          select: { cardId: true, slug: true },
          distinct: ["cardId"],
        })
      : [];
    const slugMap = new Map<number, string>();
    for (const v of variants) {
      if (!slugMap.has(v.cardId)) {
        slugMap.set(v.cardId, v.slug);
      }
    }

    const stats: HumanCardStatOut[] = validRows
      .map((r: HumanCardStatRow): HumanCardStatOut => {
        const denom = r.wins + r.losses;
        const winRate = denom > 0 ? r.wins / denom : 0;
        return {
          cardId: r.cardId,
          name: nameMap.get(r.cardId) || String(r.cardId),
          plays: r.plays,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          winRate,
          slug: slugMap.get(r.cardId) || null,
        };
      })
      .sort((a: HumanCardStatOut, b: HumanCardStatOut) => {
        if (order === "winRate")
          return b.winRate - a.winRate || b.plays - a.plays;
        if (order === "wins") return b.wins - a.wins || b.plays - a.plays;
        return b.plays - a.plays;
      })
      .slice(0, limit);

    return NextResponse.json({
      stats,
      format,
      order,
      limit,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load card stats" },
      { status: 500 }
    );
  }
}

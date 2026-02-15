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

type CardCategory = "avatar" | "site" | "spellbook" | "all";

function parseCategory(raw: string | null): CardCategory {
  if (raw === "avatar") return "avatar";
  if (raw === "site") return "site";
  if (raw === "spellbook") return "spellbook";
  return "all";
}

function matchesCategory(type: string | undefined, category: CardCategory): boolean {
  if (category === "all") return true;
  const lower = (type || "").toLowerCase();
  if (category === "avatar") return lower === "avatar";
  if (category === "site") return lower.includes("site");
  // spellbook = everything that isn't avatar or site
  return lower !== "avatar" && !lower.includes("site");
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
  type: string | null;
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
    const category = parseCategory(url.searchParams.get("category"));

    // Try serving from pre-computed cache
    const snapshot = await prisma.metaStatsSnapshot.findUnique({
      where: { key: `cards:${format}:${category}:${order}` },
    });
    if (snapshot) {
      const cached = snapshot.data as Record<string, unknown>;
      // Apply client-requested limit to cached stats
      const cachedStats = Array.isArray(cached.stats) ? cached.stats.slice(0, limit) : cached.stats;
      return NextResponse.json({
        ...cached,
        stats: cachedStats,
        limit,
        generatedAt: snapshot.computedAt.toISOString(),
      });
    }

    // Fallback: compute on-the-fly
    // When filtering by category, fetch more rows so we have enough after filtering
    const fetchLimit = category === "all" ? limit : limit * 4;

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
      take: fetchLimit,
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

    // Fetch card names, slugs, and types in parallel
    const [cards, variants, cardMeta] = ids.length
      ? await Promise.all([
          prisma.card.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          }),
          prisma.variant.findMany({
            where: { cardId: { in: ids } },
            select: { cardId: true, slug: true },
            distinct: ["cardId"],
          }),
          prisma.cardSetMetadata.findMany({
            where: { cardId: { in: ids } },
            select: { cardId: true, type: true },
            distinct: ["cardId"],
          }),
        ])
      : [[], [], []];

    const nameMap = new Map(
      cards.map((c: { id: number; name: string }) => [c.id, c.name] as const)
    );
    const slugMap = new Map<number, string>();
    for (const v of variants) {
      if (!slugMap.has(v.cardId)) {
        slugMap.set(v.cardId, v.slug);
      }
    }
    const typeMap = new Map<number, string>();
    for (const m of cardMeta) {
      if (!typeMap.has(m.cardId) && m.type) {
        typeMap.set(m.cardId, m.type);
      }
    }

    const stats: HumanCardStatOut[] = validRows
      .filter((r) => matchesCategory(typeMap.get(r.cardId), category))
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
          type: typeMap.get(r.cardId) || null,
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
      category,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load card stats" },
      { status: 500 }
    );
  }
}

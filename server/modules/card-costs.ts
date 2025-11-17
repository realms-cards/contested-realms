import type { PrismaClient } from "@prisma/client";

type Patch = Record<string, unknown>;
type Card = { name?: string; cost?: number | undefined } & Record<string, unknown>;

let cardCostCache: Map<string, number> | null = null;

export async function loadCardCosts(prismaClient: PrismaClient): Promise<Map<string, number>> {
  if (cardCostCache) return cardCostCache;

  try {
    const metas = await prismaClient.cardSetMetadata.findMany({
      select: {
        card: { select: { name: true } },
        cost: true,
      },
    });

    const map = new Map<string, number>();
    for (const meta of metas) {
      const name = meta.card?.name;
      if (name && meta.cost !== null && meta.cost !== undefined) {
        if (!map.has(name)) {
          map.set(name, meta.cost);
        }
      }
    }

    cardCostCache = map;
    try {
      console.log(`[CardCosts] Loaded ${map.size} card costs from database`);
    } catch {
      // noop
    }
    return map;
  } catch (err) {
    try {
      console.error("[CardCosts] Failed to load card costs:", err instanceof Error ? err.message : err);
    } catch {
      // noop
    }
    cardCostCache = new Map();
    return cardCostCache;
  }
}

export async function enrichPatchWithCosts<T extends Patch>(patch: T, prismaClient: PrismaClient): Promise<T> {
  if (!patch || typeof patch !== "object") return patch;

  const costMap = await loadCardCosts(prismaClient);

  const enrichCard = (card: Card | undefined | null): Card | undefined | null => {
    if (!card || typeof card !== "object" || !card.name) return card;
    if (card.cost === undefined && costMap.has(card.name)) {
      return { ...card, cost: costMap.get(card.name) };
    }
    return card;
  };

  const enrichCardArray = (arr: unknown): unknown => {
    if (!Array.isArray(arr)) return arr;
    return arr.map((item) => enrichCard(item as Card));
  };

  const enriched: Patch = { ...patch };

  if (patch && typeof patch === "object" && (patch as Patch).zones) {
    enriched.zones = {};
    for (const [seat, zones] of Object.entries((patch as Patch).zones as Record<string, unknown>)) {
      if (zones && typeof zones === "object") {
        const seatZones: Record<string, unknown> = {};
        for (const [zoneName, cards] of Object.entries(zones as Record<string, unknown>)) {
          seatZones[zoneName] = enrichCardArray(cards);
        }
        (enriched.zones as Record<string, unknown>)[seat] = seatZones;
      } else {
        (enriched.zones as Record<string, unknown>)[seat] = zones;
      }
    }
  }

  const board = (patch as Patch).board as Patch | undefined;
  if (board?.sites && typeof board.sites === "object") {
    const sites: Record<string, unknown> = {};
    for (const [pos, tile] of Object.entries(board.sites as Record<string, Patch | undefined>)) {
      if (tile?.card) {
        sites[pos] = {
          ...tile,
          card: enrichCard(tile.card as Card),
        };
      } else {
        sites[pos] = tile;
      }
    }
    enriched.board = { ...board, sites };
  }

  const permanents = (patch as Patch).permanents as Record<string, unknown> | undefined;
  if (permanents) {
    // Check if this is a delta patch by looking for __remove markers
    // Delta patches use instanceId-based merging and must preserve exact structure for echo filtering
    const isDeltaPatch = Object.values(permanents).some((arr: unknown) => {
      if (!Array.isArray(arr)) return false;
      return arr.some((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        // Presence of __remove marker indicates this is a delta patch
        return '__remove' in (item as Record<string, unknown>);
      });
    });

    // Skip enrichment for delta patches to preserve echo filtering
    // Full snapshots don't use __remove, so they'll still be enriched
    if (!isDeltaPatch) {
      const next: Record<string, unknown> = {};
      for (const [seat, units] of Object.entries(permanents)) {
        next[seat] = enrichCardArray(units);
      }
      enriched.permanents = next;
    } else if (process.env.NODE_ENV !== 'production') {
      try {
        console.log('[CardCosts] Skipping enrichment for delta patch (preserving echo filter)');
      } catch {
        // ignore
      }
    }
  }

  return enriched as T;
}

export function resetCardCostCache(): void {
  cardCostCache = null;
}

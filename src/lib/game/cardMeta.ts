import type { CardMeta } from "@/lib/game/cardSorting";

// Shape returned by API/meta endpoints used across the app
export type ApiCardMetaRow = {
  cardId: number;
  cost: number | null | undefined;
  thresholds: Record<string, number> | null | undefined;
  attack: number | null | undefined;
  defence: number | null | undefined;
};

// Normalize a list of API rows into a CardId -> CardMeta map, coercing undefined to null
export function toCardMetaMap(rows: ApiCardMetaRow[]): Record<number, CardMeta> {
  const out: Record<number, CardMeta> = {};
  for (const row of rows) {
    const id = Number(row.cardId);
    if (!Number.isFinite(id)) continue;
    out[id] = {
      cost: row.cost ?? null,
      thresholds: (row.thresholds as Record<string, number> | null) ?? null,
      attack: row.attack ?? null,
      defence: row.defence ?? null,
    };
  }
  return out;
}

// Merge multiple CardMeta maps. Later maps overwrite earlier ones for the same cardId.
export function mergeCardMetaMaps(
  ...maps: Array<Record<number, CardMeta> | undefined>
): Record<number, CardMeta> {
  const out: Record<number, CardMeta> = {};
  for (const m of maps) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      const id = Number(k);
      if (!Number.isFinite(id)) continue;
      out[id] = v;
    }
  }
  return out;
}


import type { Prisma } from '@prisma/client';

export const deckCardSelect = {
  cardId: true,
  setId: true,
  zone: true,
  count: true,
  variantId: true,
  card: {
    select: {
      name: true,
      meta: {
        select: {
          setId: true,
          type: true,
          thresholds: true,
        },
      },
    },
  },
  variant: {
    select: {
      slug: true,
      typeText: true,
    },
  },
} as const;

export type DeckCardWithRelations = {
  cardId: number;
  setId: number | null;
  zone: string | null;
  count: number | null;
  variantId: number | null;
  card?: {
    name: string | null;
    meta?: Array<{
      setId: number;
      type: string | null;
      thresholds: Prisma.JsonValue | null;
    }>;
  };
  variant?: {
    slug: string | null;
    typeText: string | null;
  };
};

function normalizeThresholds(value: Prisma.JsonValue | null): Record<string, number> | null {
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, number>;
  } catch {
    return null;
  }
}

export function buildTournamentDeckList(cards: DeckCardWithRelations[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const card of cards) {
    const countRaw = Number(card.count ?? 0);
    if (!Number.isFinite(countRaw) || countRaw <= 0) {
      continue;
    }
    const count = Math.max(1, countRaw);
    const metaEntry = card.card?.meta?.find((m) => (card.setId != null ? m.setId === card.setId : false));
    let typeText = card.variant?.typeText || metaEntry?.type || '';
    if (!typeText) {
      const zoneLower = card.zone?.toLowerCase() ?? '';
      if (zoneLower === 'atlas') typeText = 'Site';
      else typeText = 'Spell';
    }
    const thresholds = normalizeThresholds(metaEntry?.thresholds ?? null);
    const slug = card.variant?.slug || (card.setId != null ? `${card.cardId}-${card.setId}` : `card-${card.cardId}`);
    const name = card.card?.name || `Card ${card.cardId}`;

    const base = {
      id: card.cardId,
      cardId: card.cardId,
      name,
      type: typeText || 'Card',
      slug,
      variantId: card.variantId ?? null,
      setId: card.setId ?? null,
      thresholds,
      zone: card.zone || null,
    };

    for (let i = 0; i < count; i += 1) {
      out.push({ ...base });
    }
  }
  return out;
}

export function deckListHasMetadata(deckList: unknown): deckList is Array<Record<string, unknown>> {
  if (!Array.isArray(deckList) || deckList.length === 0) return false;
  return deckList.every((entry) =>
    entry &&
    typeof entry === 'object' &&
    'name' in entry &&
    'type' in entry &&
    'slug' in entry
  );
}

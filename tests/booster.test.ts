import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateBooster } from '@/lib/booster';

type Rarity = 'Ordinary' | 'Exceptional' | 'Elite' | 'Unique';
type Finish = 'Standard' | 'Foil';

// Minimal Prisma-like client mock
function makeClient() {
  const setId = 1;
  const cards = [
    { id: 1, name: 'Ordinary One' },
    { id: 2, name: 'Ordinary Two' },
    { id: 3, name: 'Exceptional One' },
    { id: 4, name: 'Elite One' },
    { id: 5, name: 'Unique One' },
    { id: 6, name: 'Avatar Sorcerer' },
  ];

  const metas = [
    { cardId: 1, rarity: 'Ordinary' as Rarity, type: 'Minion' },
    { cardId: 2, rarity: 'Ordinary' as Rarity, type: 'Minion' },
    { cardId: 3, rarity: 'Exceptional' as Rarity, type: 'Spell' },
    { cardId: 4, rarity: 'Elite' as Rarity, type: 'Spell' },
    { cardId: 5, rarity: 'Unique' as Rarity, type: 'Site' },
    { cardId: 6, rarity: 'Ordinary' as Rarity, type: 'Avatar' },
  ];

  const variantsStd = [
    { id: 101, cardId: 1, slug: 't_ord1', finish: 'Standard' as Finish, product: 'Booster' },
    { id: 102, cardId: 2, slug: 't_ord2', finish: 'Standard' as Finish, product: 'Booster' },
    { id: 103, cardId: 3, slug: 't_exc1', finish: 'Standard' as Finish, product: 'Booster' },
    { id: 104, cardId: 4, slug: 't_eli1', finish: 'Standard' as Finish, product: 'Booster' },
    { id: 105, cardId: 5, slug: 't_uni1', finish: 'Standard' as Finish, product: 'Booster' },
    { id: 106, cardId: 6, slug: 't_ava1', finish: 'Standard' as Finish, product: 'Booster' },
  ];

  const variantsFoil = [
    { id: 201, cardId: 1, slug: 't_ord1_f', finish: 'Foil' as Finish, product: 'Booster' },
    { id: 202, cardId: 2, slug: 't_ord2_f', finish: 'Foil' as Finish, product: 'Booster' },
    { id: 203, cardId: 3, slug: 't_exc1_f', finish: 'Foil' as Finish, product: 'Booster' },
    { id: 204, cardId: 4, slug: 't_eli1_f', finish: 'Foil' as Finish, product: 'Booster' },
    { id: 205, cardId: 5, slug: 't_uni1_f', finish: 'Foil' as Finish, product: 'Booster' },
  ];

  const client = {
    set: {
      async findUnique({ where: { name } }: { where: { name: string } }) {
        if (name !== 'TestSet') return null;
        return {
          id: setId,
          name,
          packConfig: {
            ordinaryCount: 2,
            exceptionalCount: 1,
            eliteOrUniqueCount: 1,
            uniqueChance: 1, // force unique
            siteOrAvatarCount: 1,
            foilChance: 1, // allow foil replacement
            foilUniqueWeight: 0,
            foilEliteWeight: 0,
            foilExceptionalWeight: 0,
            foilOrdinaryWeight: 10, // prefer ordinary foil
            foilReplacesOrdinary: true,
          },
        };
      },
    },
    cardSetMetadata: {
      async findMany({ where: { setId: sid } }: { where: { setId: number } }) {
        if (sid !== setId) return [];
        return metas;
      },
    },
    variant: {
      async findMany({ where, select }: { where: { finish: Finish }, select: { id: true; cardId: true; slug: true; finish: true; product: true } }) {
        if (where.finish === 'Standard') return variantsStd;
        if (where.finish === 'Foil') return variantsFoil;
        return [];
      },
    },
    card: {
      async findMany({ where: { id: { in: ids } } }: { where: { id: { in: number[] } } }) {
        return cards.filter(c => ids.includes(c.id));
      },
      async findUnique({ where: { name } }: { where: { name: string } }) {
        return cards.find(c => c.name === name) || null;
      },
    },
  } as const;
  return client as unknown as Parameters<typeof generateBooster>[1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateBooster', () => {
  it('creates a pack with uniqueness and expected slots', async () => {
    // Deterministic randomness (pick first candidates)
    vi.spyOn(Math, 'random').mockImplementation(() => 0.01);
    const client = makeClient();
    const pack = await generateBooster('TestSet', client, false);
    // Slots: 1 top (Unique), 1 Exceptional, 2 Ordinary, 1 Site/Avatar = 5
    expect(pack.length).toBe(5);
    // No duplicate cardIds
    const ids = new Set(pack.map(p => p.cardId));
    expect(ids.size).toBe(pack.length);
    // Contains a Unique and an Exceptional
    expect(pack.some(p => p.rarity === 'Unique')).toBe(true);
    expect(pack.some(p => p.rarity === 'Exceptional')).toBe(true);
  });

  it('replaces an ordinary with a foil when configured', async () => {
    // First Math.random calls influence picks; we just need at least one ordinary to be present
    // and later foil selection to happen (foilChance=1 forces it).
    // Use a mid value for randomness to avoid edge conditions.
    vi.spyOn(Math, 'random').mockImplementation(() => 0.42);
    const client = makeClient();
    const pack = await generateBooster('TestSet', client, false);
    // Ensure at least one Foil present
    expect(pack.some(p => p.finish === 'Foil')).toBe(true);
    // Pack size remains constant
    expect(pack.length).toBe(5);
  });
});

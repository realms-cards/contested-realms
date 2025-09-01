import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './prisma';

type Rarity = 'Ordinary' | 'Exceptional' | 'Elite' | 'Unique';
type Finish = 'Standard' | 'Foil';

type VariantSel = {
  id: number;
  cardId: number;
  slug: string;
  finish: Finish;
  product: string;
};

export type BoosterCard = {
  variantId: number;
  slug: string;
  finish: Finish;
  product: string;
  rarity: Rarity;
  type: string | null;
  cardId: number;
  cardName: string;
};

function choice<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i] ?? null;
}

function weightedChoice<T>(items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    const w = Math.max(0, weight);
    if (r < w) return item;
    r -= w;
  }
  return items.at(-1)?.item ?? null;
}

function pickUniqueFrom(pool: VariantSel[], used: Set<number>): VariantSel | null {
  if (!pool.length) return null;
  const candidates = pool.filter(v => !used.has(v.cardId));
  return choice(candidates);
}

export async function generateBooster(setName: string, client: PrismaClient = defaultPrisma, replaceAvatars = false): Promise<BoosterCard[]> {
  const set = await client.set.findUnique({ where: { name: setName }, include: { packConfig: true } });
  if (!set || !set.packConfig) throw new Error(`Set or PackConfig not found for set=${setName}`);
  const cfg = set.packConfig;

  // Build meta map: cardId -> { rarity, type }
  const metas: { cardId: number; rarity: Rarity; type: string }[] = await client.cardSetMetadata.findMany({
    where: { setId: set.id },
    select: { cardId: true, rarity: true, type: true },
  });
  const metaByCardId = new Map<number, { rarity: Rarity; type: string | null }>();
  for (const m of metas) metaByCardId.set(m.cardId, { rarity: m.rarity, type: m.type });

  // Fetch all booster variants by finish
  const [variantsStd, variantsFoil]: [VariantSel[], VariantSel[]] = await Promise.all([
    client.variant.findMany({
      where: { setId: set.id, product: 'Booster', finish: 'Standard' },
      select: { id: true, cardId: true, slug: true, finish: true, product: true },
    }),
    client.variant.findMany({
      where: { setId: set.id, product: 'Booster', finish: 'Foil' },
      select: { id: true, cardId: true, slug: true, finish: true, product: true },
    }),
  ]);

  // Group by rarity using meta map
  const stdByRarity: Record<Rarity, VariantSel[]> = {
    Ordinary: [], Exceptional: [], Elite: [], Unique: [],
  };
  for (const v of variantsStd) {
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    stdByRarity[meta.rarity].push(v);
  }

  const foilByRarity: Record<Rarity, VariantSel[]> = {
    Ordinary: [], Exceptional: [], Elite: [], Unique: [],
  };
  for (const v of variantsFoil) {
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    foilByRarity[meta.rarity].push(v);
  }

  // Site/Avatar pool (standard only) for sets that use an extra slot (Alpha)
  const siteAvatarCardIds: number[] = [];
  for (const m of metas) {
    const t = m.type?.toLowerCase() ?? '';
    if (t.includes('site') || t.includes('avatar')) siteAvatarCardIds.push(m.cardId);
  }
  const siteAvatarStd = variantsStd.filter(v => siteAvatarCardIds.includes(v.cardId));

  const picks: BoosterCard[] = [];
  const used = new Set<number>(); // track cardIds to prevent duplicates in a pack

  // Top rarity slot (Elite or Unique)
  const pickUnique = Math.random() < cfg.uniqueChance;
  const topPool = pickUnique ? stdByRarity.Unique : stdByRarity.Elite;
  const topVariant = pickUniqueFrom(topPool, used)
    ?? pickUniqueFrom(stdByRarity.Elite, used)
    ?? pickUniqueFrom(stdByRarity.Unique, used);
  if (topVariant) {
    const meta = metaByCardId.get(topVariant.cardId)!;
    picks.push({
      variantId: topVariant.id,
      slug: topVariant.slug,
      finish: topVariant.finish as Finish,
      product: topVariant.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: topVariant.cardId,
      cardName: '', // fill later
    });
    used.add(topVariant.cardId);
  }

  // Exceptional slots
  for (let i = 0; i < cfg.exceptionalCount; i++) {
    const v = pickUniqueFrom(stdByRarity.Exceptional, used);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId)!;
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish as Finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: '',
    });
    used.add(v.cardId);
  }

  // Ordinary slots
  for (let i = 0; i < cfg.ordinaryCount; i++) {
    const v = pickUniqueFrom(stdByRarity.Ordinary, used);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId)!;
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish as Finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: '',
    });
    used.add(v.cardId);
  }

  // Site/Avatar extra slot if configured
  for (let i = 0; i < cfg.siteOrAvatarCount; i++) {
    const v = pickUniqueFrom(siteAvatarStd, used) || pickUniqueFrom(stdByRarity.Ordinary, used);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId)!;
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish as Finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: '',
    });
    used.add(v.cardId);
  }

  // Foil replacement logic (replace one ordinary slot)
  if (cfg.foilChance && Math.random() < cfg.foilChance) {
    const foilRarity = weightedChoice<Rarity>([
      { item: 'Unique' as Rarity, weight: cfg.foilUniqueWeight },
      { item: 'Elite' as Rarity, weight: cfg.foilEliteWeight },
      { item: 'Exceptional' as Rarity, weight: cfg.foilExceptionalWeight },
      { item: 'Ordinary' as Rarity, weight: cfg.foilOrdinaryWeight },
    ]);
    const foilPool = foilRarity ? foilByRarity[foilRarity] : [];
    const foil = pickUniqueFrom(foilPool, used);
    if (foil) {
      // Find an ordinary index to replace
      const ordIdx = picks.findIndex(p => p.rarity === 'Ordinary');
      if (ordIdx !== -1) {
        const meta = metaByCardId.get(foil.cardId)!;
        // update used set: remove the replaced ordinary and add the foil card
        used.delete(picks[ordIdx].cardId);
        picks[ordIdx] = {
          variantId: foil.id,
          slug: foil.slug,
          finish: foil.finish as Finish,
          product: foil.product,
          rarity: meta.rarity,
          type: meta.type ?? null,
          cardId: foil.cardId,
          cardName: '',
        };
        used.add(foil.cardId);
      } else {
        // No ordinary to replace; skip foil to maintain pack size and uniqueness
      }
    }
  }

  // Fill card names in one query
  const ids = Array.from(new Set(picks.map(p => p.cardId)));
  const cards: { id: number; name: string }[] = await client.card.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map<number, string>();
  for (const c of cards) nameById.set(c.id, c.name);
  for (const p of picks) p.cardName = nameById.get(p.cardId) || '';

  // Avatar replacement logic for Beta/Alpha packs (after names are filled)
  if (replaceAvatars && (setName === 'Alpha' || setName === 'Beta')) {
    try {
      // Find Sorcerer avatars in picks
      const sorcererIndices: number[] = [];
      for (let i = 0; i < picks.length; i++) {
        const pick = picks[i];
        const meta = metaByCardId.get(pick.cardId);
        if (meta?.type?.toLowerCase().includes('avatar') && pick.cardName.toLowerCase().includes('sorcerer')) {
          sorcererIndices.push(i);
        }
      }

      if (sorcererIndices.length > 0) {
        // Get Beta common avatars (Geomancer, Flamecaller, Sparkmage, Waveshaper)
        const betaAvatarNames = ['Geomancer', 'Flamecaller', 'Sparkmage', 'Waveshaper'];
        const betaAvatars = await client.card.findMany({
          where: { 
            name: { in: betaAvatarNames }
          },
          select: { id: true, name: true },
        });

        if (betaAvatars.length > 0) {
          // Find Beta set for variants
          const betaSet = await client.set.findUnique({ where: { name: 'Beta' } });
          if (betaSet) {
            const betaVariants = await client.variant.findMany({
              where: { 
                cardId: { in: betaAvatars.map(c => c.id) },
                setId: betaSet.id,
                product: 'Booster',
                finish: 'Standard'
              },
              select: { id: true, cardId: true, slug: true, finish: true, product: true },
            });

            // Replace each Sorcerer with a random Beta avatar
            for (const sorcererIdx of sorcererIndices) {
              const randomAvatar = choice(betaVariants);
              if (randomAvatar) {
                const avatarCard = betaAvatars.find(c => c.id === randomAvatar.cardId);
                if (avatarCard) {
                  picks[sorcererIdx] = {
                    variantId: randomAvatar.id,
                    slug: randomAvatar.slug,
                    finish: randomAvatar.finish as Finish,
                    product: randomAvatar.product,
                    rarity: 'Ordinary', // Beta avatars are ordinary
                    type: 'Avatar',
                    cardId: randomAvatar.cardId,
                    cardName: avatarCard.name,
                  };
                }
              }
            }
          }
        }
      }
    } catch (avatarError) {
      // Log avatar replacement error but don't fail the entire booster generation
      console.error('Avatar replacement failed:', avatarError);
    }
  }

  return picks;
}

export async function generateBoosters(setName: string, count: number, client: PrismaClient = defaultPrisma, replaceAvatars = false) {
  const packs: BoosterCard[][] = [];
  for (let i = 0; i < count; i++) {
    packs.push(await generateBooster(setName, client, replaceAvatars));
  }
  return packs;
}

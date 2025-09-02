// Deterministic booster generation for the Node server
// Uses Prisma and a seeded RNG passed in from the caller

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Seed helpers (xmur3 + sfc32)
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function createRngFromString(seedString) {
  const seed = xmur3(String(seedString));
  return sfc32(seed(), seed(), seed(), seed());
}

function choice(arr, rng) {
  if (!arr || arr.length === 0) return null;
  const i = Math.floor(rng() * arr.length);
  return arr[i] ?? null;
}

function weightedChoice(items, rng) {
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const { item, weight } of items) {
    const w = Math.max(0, weight);
    if (r < w) return item;
    r -= w;
  }
  return items.length ? items[items.length - 1].item : null;
}

function pickUniqueFrom(pool, used, rng) {
  if (!pool || pool.length === 0) return null;
  const candidates = pool.filter((v) => !used.has(v.cardId));
  if (!candidates.length) return null;
  return choice(candidates, rng);
}

async function generateBoosterDeterministic(setName, rng, replaceAvatars = false) {
  const set = await prisma.set.findUnique({ where: { name: setName }, include: { packConfig: true } });
  if (!set || !set.packConfig) throw new Error(`Set or PackConfig not found for set=${setName}`);
  const cfg = set.packConfig;

  // Build meta map: cardId -> { rarity, type }
  const metas = await prisma.cardSetMetadata.findMany({
    where: { setId: set.id },
    select: { cardId: true, rarity: true, type: true, cost: true },
  });
  const metaByCardId = new Map();
  for (const m of metas) metaByCardId.set(m.cardId, { rarity: m.rarity, type: m.type, cost: m.cost });

  // Fetch all booster variants by finish
  const [variantsStd, variantsFoil] = await Promise.all([
    prisma.variant.findMany({
      where: { setId: set.id, product: 'Booster', finish: 'Standard' },
      select: { id: true, cardId: true, slug: true, finish: true, product: true },
    }),
    prisma.variant.findMany({
      where: { setId: set.id, product: 'Booster', finish: 'Foil' },
      select: { id: true, cardId: true, slug: true, finish: true, product: true },
    }),
  ]);

  // Group by rarity using meta map
  const rarities = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];
  const stdByRarity = Object.fromEntries(rarities.map((r) => [r, []]));
  for (const v of variantsStd) {
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    stdByRarity[meta.rarity].push(v);
  }
  const foilByRarity = Object.fromEntries(rarities.map((r) => [r, []]));
  for (const v of variantsFoil) {
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    foilByRarity[meta.rarity].push(v);
  }

  // Site/Avatar pool (standard only)
  const siteAvatarCardIds = [];
  for (const m of metas) {
    const t = (m.type || '').toLowerCase();
    if (t.includes('site') || t.includes('avatar')) siteAvatarCardIds.push(m.cardId);
  }
  const siteAvatarStd = variantsStd.filter((v) => siteAvatarCardIds.includes(v.cardId));

  const picks = [];
  const used = new Set(); // track cardIds to prevent duplicates in a pack

  // Top rarity slot (Elite or Unique)
  const pickUnique = rng() < cfg.uniqueChance;
  const topPool = pickUnique ? stdByRarity['Unique'] : stdByRarity['Elite'];
  const topVariant = pickUniqueFrom(topPool, used, rng)
    || pickUniqueFrom(stdByRarity['Elite'], used, rng)
    || pickUniqueFrom(stdByRarity['Unique'], used, rng);
  if (topVariant) {
    const meta = metaByCardId.get(topVariant.cardId) || { rarity: 'Elite', type: null, cost: null };
    picks.push({
      variantId: topVariant.id,
      slug: topVariant.slug,
      finish: topVariant.finish,
      product: topVariant.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: topVariant.cardId,
      cardName: '', // fill later
      cost: meta.cost ?? null,
    });
    used.add(topVariant.cardId);
  }

  // Exceptional slots
  for (let i = 0; i < cfg.exceptionalCount; i++) {
    const v = pickUniqueFrom(stdByRarity['Exceptional'], used, rng);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId) || { rarity: 'Exceptional', type: null, cost: null };
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: '',
      cost: meta.cost ?? null,
    });
    used.add(v.cardId);
  }

  // Ordinary slots
  for (let i = 0; i < cfg.ordinaryCount; i++) {
    const v = pickUniqueFrom(stdByRarity['Ordinary'], used, rng);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId) || { rarity: 'Ordinary', type: null, cost: null };
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: '',
      cost: meta.cost ?? null,
    });
    used.add(v.cardId);
  }

  // Site/Avatar extra slot if configured
  for (let i = 0; i < (cfg.siteOrAvatarCount || 0); i++) {
    const v = pickUniqueFrom(siteAvatarStd, used, rng) || pickUniqueFrom(stdByRarity['Ordinary'], used, rng);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId) || { rarity: 'Ordinary', type: null, cost: null };
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: '',
      cost: meta.cost ?? null,
    });
    used.add(v.cardId);
  }

  // Foil replacement logic (replace one ordinary slot)
  if (cfg.foilChance && rng() < cfg.foilChance) {
    const foilRarity = weightedChoice([
      { item: 'Unique', weight: cfg.foilUniqueWeight },
      { item: 'Elite', weight: cfg.foilEliteWeight },
      { item: 'Exceptional', weight: cfg.foilExceptionalWeight },
      { item: 'Ordinary', weight: cfg.foilOrdinaryWeight },
    ], rng);
    const foilPool = foilRarity ? foilByRarity[foilRarity] : [];
    const foil = pickUniqueFrom(foilPool, used, rng);
    if (foil) {
      // Find an ordinary index to replace
      const ordIdx = picks.findIndex((p) => p.rarity === 'Ordinary');
      if (ordIdx !== -1) {
        const meta = metaByCardId.get(foil.cardId) || { rarity: 'Ordinary', type: null, cost: null };
        // update used set: remove the replaced ordinary and add the foil card
        used.delete(picks[ordIdx].cardId);
        picks[ordIdx] = {
          variantId: foil.id,
          slug: foil.slug,
          finish: foil.finish,
          product: foil.product,
          rarity: meta.rarity,
          type: meta.type ?? null,
          cardId: foil.cardId,
          cardName: '',
          cost: meta.cost ?? null,
        };
        used.add(foil.cardId);
      }
    }
  }

  // Fill card names in one query
  const ids = Array.from(new Set(picks.map((p) => p.cardId)));
  const cards = await prisma.card.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(cards.map((c) => [c.id, c.name]));
  for (const p of picks) p.cardName = nameById.get(p.cardId) || '';

  // Avatar replacement for Alpha/Beta
  if (replaceAvatars && (setName === 'Alpha' || setName === 'Beta')) {
    try {
      const sorcererIndices = [];
      for (let i = 0; i < picks.length; i++) {
        const pick = picks[i];
        const meta = metaByCardId.get(pick.cardId);
        if ((meta?.type || '').toLowerCase().includes('avatar') && (pick.cardName || '').toLowerCase().includes('sorcerer')) {
          sorcererIndices.push(i);
        }
      }
      if (sorcererIndices.length > 0) {
        const betaAvatarNames = ['Geomancer', 'Flamecaller', 'Sparkmage', 'Waveshaper'];
        const betaAvatars = await prisma.card.findMany({
          where: { name: { in: betaAvatarNames } },
          select: { id: true, name: true },
        });
        if (betaAvatars.length > 0) {
          const betaSet = await prisma.set.findUnique({ where: { name: 'Beta' } });
          if (betaSet) {
            const betaVariants = await prisma.variant.findMany({
              where: {
                cardId: { in: betaAvatars.map((c) => c.id) },
                setId: betaSet.id,
                product: 'Booster',
                finish: 'Standard',
              },
              select: { id: true, cardId: true, slug: true, finish: true, product: true },
            });
            for (const idx of sorcererIndices) {
              const randomAvatar = choice(betaVariants, rng);
              if (!randomAvatar) continue;
              const avatarCard = betaAvatars.find((c) => c.id === randomAvatar.cardId);
              if (!avatarCard) continue;
              picks[idx] = {
                variantId: randomAvatar.id,
                slug: randomAvatar.slug,
                finish: randomAvatar.finish,
                product: randomAvatar.product,
                rarity: 'Ordinary',
                type: 'Avatar',
                cardId: randomAvatar.cardId,
                cardName: avatarCard.name,
                cost: null,
              };
            }
          }
        }
      }
    } catch (err) {
      console.error('Avatar replacement failed:', err);
    }
  }

  return picks;
}

module.exports = {
  createRngFromString,
  generateBoosterDeterministic,
  prisma,
};

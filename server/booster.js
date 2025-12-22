// Deterministic booster generation for the Node server
// Uses Prisma and a seeded RNG passed in from the caller

const { PrismaClient } = require("@prisma/client");
const { applyRarityOverride } = require("./rarity-overrides");
const prisma = new PrismaClient();

// Cache heavy booster metadata since sealed generation may call this repeatedly per match.
// Each cache entry stores Promises so concurrent calls share in-flight work.
const boosterMetaCache = new Map();

async function getBoosterMetadata(setName) {
  if (!boosterMetaCache.has(setName)) {
    boosterMetaCache.set(
      setName,
      (async () => {
        const set = await prisma.set.findUnique({
          where: { name: setName },
          include: { packConfig: true },
        });
        if (!set || !set.packConfig) {
          throw new Error(`Set or PackConfig not found for set=${setName}`);
        }

        const [metas, variantsStd, variantsFoil] = await Promise.all([
          prisma.cardSetMetadata.findMany({
            where: { setId: set.id },
            select: { cardId: true, rarity: true, type: true, cost: true },
          }),
          prisma.variant.findMany({
            where: { setId: set.id, product: "Booster", finish: "Standard" },
            select: {
              id: true,
              cardId: true,
              slug: true,
              finish: true,
              product: true,
            },
          }),
          prisma.variant.findMany({
            where: { setId: set.id, product: "Booster", finish: "Foil" },
            select: {
              id: true,
              cardId: true,
              slug: true,
              finish: true,
              product: true,
            },
          }),
        ]);

        // First fetch card names so we can apply rarity overrides
        const cardIds = metas.map((m) => m.cardId);
        const cardNames = await prisma.card.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, name: true },
        });
        const nameByCardId = new Map(cardNames.map((c) => [c.id, c.name]));

        // Build metadata map with rarity overrides applied
        const metaByCardId = new Map();
        for (const m of metas) {
          const cardName = nameByCardId.get(m.cardId) || "";
          metaByCardId.set(m.cardId, {
            // Apply manual rarity override for cards missing rarity (e.g., Gothic avatars)
            rarity: applyRarityOverride(cardName, m.rarity),
            type: m.type,
            cost: m.cost,
          });
        }

        return { set, variantsStd, variantsFoil, metaByCardId, nameByCardId };
      })()
    );
  }
  return boosterMetaCache.get(setName);
}

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
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
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

async function generateBoosterDeterministic(
  setName,
  rng,
  replaceAvatars = false,
  freeAvatars = false
) {
  const { set, variantsStd, variantsFoil, metaByCardId, nameByCardId } =
    await getBoosterMetadata(setName);
  const cfg = set.packConfig;

  // Handle fixed packs (mini-sets like Dragonlord) - return all cards from the set
  if (cfg.isFixedPack) {
    return variantsStd.map((v) => {
      const meta = metaByCardId.get(v.cardId) || {
        rarity: "Ordinary",
        type: null,
      };
      const cardName = nameByCardId.get(v.cardId) || "";
      return {
        variantId: v.id,
        slug: v.slug,
        finish: v.finish,
        product: v.product,
        rarity: meta.rarity || "Ordinary",
        type: meta.type || null,
        cardId: v.cardId,
        cardName,
        setName,
      };
    });
  }

  // Group by rarity using meta map
  const rarities = ["Ordinary", "Exceptional", "Elite", "Unique"];
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
  for (const [cardId, meta] of metaByCardId.entries()) {
    const t = (meta.type || "").toLowerCase();
    if (t.includes("site") || t.includes("avatar"))
      siteAvatarCardIds.push(cardId);
  }
  const siteAvatarStd = variantsStd.filter((v) =>
    siteAvatarCardIds.includes(v.cardId)
  );

  const picks = [];
  const used = new Set(); // track cardIds to prevent duplicates in a pack

  // Top rarity slot (Elite or Unique)
  const pickUnique = rng() < cfg.uniqueChance;
  const topPool = pickUnique ? stdByRarity["Unique"] : stdByRarity["Elite"];
  const topVariant =
    pickUniqueFrom(topPool, used, rng) ||
    pickUniqueFrom(stdByRarity["Elite"], used, rng) ||
    pickUniqueFrom(stdByRarity["Unique"], used, rng);
  if (topVariant) {
    const meta = metaByCardId.get(topVariant.cardId) || {
      rarity: "Elite",
      type: null,
      cost: null,
    };
    picks.push({
      variantId: topVariant.id,
      slug: topVariant.slug,
      finish: topVariant.finish,
      product: topVariant.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: topVariant.cardId,
      cardName: "", // fill later
      cost: meta.cost ?? null,
    });
    used.add(topVariant.cardId);
  }

  // Exceptional slots
  for (let i = 0; i < cfg.exceptionalCount; i++) {
    const v = pickUniqueFrom(stdByRarity["Exceptional"], used, rng);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId) || {
      rarity: "Exceptional",
      type: null,
      cost: null,
    };
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: "",
      cost: meta.cost ?? null,
    });
    used.add(v.cardId);
  }

  // Ordinary slots
  for (let i = 0; i < cfg.ordinaryCount; i++) {
    const v = pickUniqueFrom(stdByRarity["Ordinary"], used, rng);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId) || {
      rarity: "Ordinary",
      type: null,
      cost: null,
    };
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: "",
      cost: meta.cost ?? null,
    });
    used.add(v.cardId);
  }

  // Site/Avatar extra slot if configured
  for (let i = 0; i < (cfg.siteOrAvatarCount || 0); i++) {
    const v =
      pickUniqueFrom(siteAvatarStd, used, rng) ||
      pickUniqueFrom(stdByRarity["Ordinary"], used, rng);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId) || {
      rarity: "Ordinary",
      type: null,
      cost: null,
    };
    picks.push({
      variantId: v.id,
      slug: v.slug,
      finish: v.finish,
      product: v.product,
      rarity: meta.rarity,
      type: meta.type ?? null,
      cardId: v.cardId,
      cardName: "",
      cost: meta.cost ?? null,
    });
    used.add(v.cardId);
  }

  // Foil replacement logic (replace one ordinary slot)
  if (cfg.foilChance && rng() < cfg.foilChance) {
    const foilRarity = weightedChoice(
      [
        { item: "Unique", weight: cfg.foilUniqueWeight },
        { item: "Elite", weight: cfg.foilEliteWeight },
        { item: "Exceptional", weight: cfg.foilExceptionalWeight },
        { item: "Ordinary", weight: cfg.foilOrdinaryWeight },
      ],
      rng
    );
    const foilPool = foilRarity ? foilByRarity[foilRarity] : [];
    const foil = pickUniqueFrom(foilPool, used, rng);
    if (foil) {
      // Find an ordinary index to replace
      const ordIdx = picks.findIndex((p) => p.rarity === "Ordinary");
      if (ordIdx !== -1) {
        const meta = metaByCardId.get(foil.cardId) || {
          rarity: "Ordinary",
          type: null,
          cost: null,
        };
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
          cardName: "",
          cost: meta.cost ?? null,
        };
        used.add(foil.cardId);
      }
    }
  }

  // Fill card names from cached map
  for (const p of picks) p.cardName = nameByCardId.get(p.cardId) || "";

  // Free Avatars mode: filter out all avatars from the pack
  if (freeAvatars) {
    const filtered = picks.filter((p) => {
      const t = (p.type || "").toLowerCase();
      return !t.includes("avatar");
    });
    // Return the filtered pack (will have fewer cards when avatars are removed)
    return filtered;
  }

  // Avatar replacement for Alpha/Beta
  if (replaceAvatars && (setName === "Alpha" || setName === "Beta")) {
    try {
      const sorcererIndices = [];
      for (let i = 0; i < picks.length; i++) {
        const pick = picks[i];
        const meta = metaByCardId.get(pick.cardId);
        if (
          (meta?.type || "").toLowerCase().includes("avatar") &&
          (pick.cardName || "").toLowerCase().includes("sorcerer")
        ) {
          sorcererIndices.push(i);
        }
      }
      if (sorcererIndices.length > 0) {
        const betaAvatarNames = [
          "Geomancer",
          "Flamecaller",
          "Sparkmage",
          "Waveshaper",
        ];
        const betaAvatars = await prisma.card.findMany({
          where: { name: { in: betaAvatarNames } },
          select: { id: true, name: true },
        });
        if (betaAvatars.length > 0) {
          const betaSet = await prisma.set.findUnique({
            where: { name: "Beta" },
          });
          if (betaSet) {
            const betaVariants = await prisma.variant.findMany({
              where: {
                cardId: { in: betaAvatars.map((c) => c.id) },
                setId: betaSet.id,
                product: "Booster",
                finish: "Standard",
              },
              select: {
                id: true,
                cardId: true,
                slug: true,
                finish: true,
                product: true,
              },
            });
            for (const idx of sorcererIndices) {
              const randomAvatar = choice(betaVariants, rng);
              if (!randomAvatar) continue;
              const avatarCard = betaAvatars.find(
                (c) => c.id === randomAvatar.cardId
              );
              if (!avatarCard) continue;
              picks[idx] = {
                variantId: randomAvatar.id,
                slug: randomAvatar.slug,
                finish: randomAvatar.finish,
                product: randomAvatar.product,
                rarity: "Ordinary",
                type: "Avatar",
                cardId: randomAvatar.cardId,
                cardName: avatarCard.name,
                cost: null,
              };
            }
          }
        }
      }
    } catch (err) {
      console.error("Avatar replacement failed:", err);
    }
  }

  return picks;
}

async function generateCubeBoosterDeterministic(cubeId, rng, packSize) {
  const cube = await prisma.cube.findUnique({
    where: { id: cubeId },
    include: {
      cards: {
        include: {
          card: { select: { name: true, elements: true } },
          variant: {
            select: {
              id: true,
              slug: true,
              finish: true,
              product: true,
              cardId: true,
            },
          },
          set: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!cube) {
    throw new Error(`Cube not found for id=${cubeId}`);
  }
  if (!cube.cards.length) {
    return [];
  }

  const metaPairs = cube.cards
    .filter((entry) => entry.setId != null)
    .map((entry) => ({ cardId: entry.cardId, setId: entry.setId }));

  const metaMap = new Map();
  if (metaPairs.length) {
    const metas = await prisma.cardSetMetadata.findMany({
      where: { OR: metaPairs },
      select: {
        cardId: true,
        setId: true,
        type: true,
        rarity: true,
        cost: true,
      },
    });
    for (const meta of metas) {
      metaMap.set(`${meta.cardId}:${meta.setId}`, {
        type: meta.type ?? null,
        rarity: meta.rarity ?? null,
        cost: meta.cost ?? null,
      });
    }
  }

  const workingPool = cube.cards
    .map((entry) => {
      const variant = entry.variant;
      const metaKey = entry.setId ? `${entry.cardId}:${entry.setId}` : null;
      const meta = metaKey ? metaMap.get(metaKey) : null;
      const cardName = entry.card?.name || "";
      const elements = entry.card?.elements || null;
      const setName = entry.set?.name || "Unknown";
      return {
        cardId: entry.cardId,
        variantId: variant?.id ?? null,
        slug: variant?.slug ?? null,
        finish: variant?.finish ?? "Standard",
        product: variant?.product ?? "Cube",
        rarity: meta?.rarity ?? null,
        type: meta?.type ?? null,
        cost: meta?.cost ?? null,
        cardName,
        element: elements,
        setName,
        remaining: Math.max(0, Number(entry.count) || 0),
      };
    })
    .filter((entry) => entry.remaining > 0);

  const picks = [];
  for (let i = 0; i < packSize && workingPool.length; i++) {
    const total = workingPool.reduce((sum, entry) => sum + entry.remaining, 0);
    if (total <= 0) break;
    let roll = rng() * total;
    let chosenIndex = -1;
    for (let idx = 0; idx < workingPool.length; idx++) {
      const candidate = workingPool[idx];
      if (roll < candidate.remaining) {
        chosenIndex = idx;
        break;
      }
      roll -= candidate.remaining;
    }
    if (chosenIndex === -1) {
      chosenIndex = workingPool.length - 1;
    }
    const chosen = workingPool[chosenIndex];
    picks.push({
      variantId: chosen.variantId,
      slug: chosen.slug,
      finish: chosen.finish,
      product: chosen.product,
      rarity: chosen.rarity,
      type: chosen.type,
      cardId: chosen.cardId,
      cardName: chosen.cardName,
      cost: chosen.cost,
      element: chosen.element,
      setName: chosen.setName,
    });
    chosen.remaining -= 1;
    if (chosen.remaining <= 0) {
      workingPool.splice(chosenIndex, 1);
    }
  }

  return picks;
}

module.exports = {
  createRngFromString,
  generateBoosterDeterministic,
  generateCubeBoosterDeterministic,
  prisma,
};

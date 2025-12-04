import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./prisma";

type Rarity = "Ordinary" | "Exceptional" | "Elite" | "Unique";
type Finish = "Standard" | "Foil";

type VariantSel = {
  id: number;
  cardId: number;
  slug: string;
  finish: Finish;
  product: string;
};

type CardMeta = {
  rarity: Rarity;
  type: string | null;
};

function toBoosterCard(variant: VariantSel, meta: CardMeta): BoosterCard {
  return {
    variantId: variant.id,
    slug: variant.slug,
    finish: variant.finish,
    product: variant.product,
    rarity: meta.rarity,
    type: meta.type,
    cardId: variant.cardId,
    cardName: "",
  };
}

export type BoosterCard = {
  variantId: number;
  slug: string;
  finish: Finish;
  product: string;
  rarity: Rarity;
  type: string | null;
  cardId: number;
  cardName: string;
  setName?: string; // Optional: which set the card came from
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

function pickUniqueFrom(
  pool: VariantSel[],
  used: Set<number>
): VariantSel | null {
  if (!pool.length) return null;
  const candidates = pool.filter((v) => !used.has(v.cardId));
  return choice(candidates);
}

export async function generateBooster(
  setName: string,
  client: PrismaClient = defaultPrisma,
  replaceAvatars = false
): Promise<BoosterCard[]> {
  const set = await client.set.findUnique({
    where: { name: setName },
    include: { packConfig: true },
  });
  if (!set || !set.packConfig)
    throw new Error(`Set or PackConfig not found for set=${setName}`);
  const cfg = set.packConfig;

  // Handle fixed packs (mini-sets like Dragonlord) - return all cards from the set
  if (cfg.isFixedPack) {
    const allVariants = await client.variant.findMany({
      where: { setId: set.id, product: "Booster", finish: "Standard" },
      select: {
        id: true,
        cardId: true,
        slug: true,
        finish: true,
        product: true,
      },
    });
    const metas = await client.cardSetMetadata.findMany({
      where: { setId: set.id },
      select: { cardId: true, rarity: true, type: true },
    });
    const metaByCardId = new Map<number, CardMeta>();
    for (const m of metas)
      metaByCardId.set(m.cardId, {
        rarity: m.rarity as Rarity,
        type: m.type ?? null,
      });

    return allVariants.map((v) => {
      const meta = metaByCardId.get(v.cardId) ?? {
        rarity: "Ordinary" as Rarity,
        type: null,
      };
      return toBoosterCard(v, meta);
    });
  }

  // Build meta map: cardId -> { rarity, type }
  const metas: { cardId: number; rarity: Rarity | null; type: string }[] =
    await client.cardSetMetadata.findMany({
      where: { setId: set.id },
      select: { cardId: true, rarity: true, type: true },
    });
  const metaByCardId = new Map<number, CardMeta>();
  for (const m of metas)
    metaByCardId.set(m.cardId, {
      rarity: m.rarity ?? "Ordinary",
      type: m.type ?? null,
    });

  // Fetch all booster variants by finish
  const [variantsStd, variantsFoil]: [VariantSel[], VariantSel[]] =
    await Promise.all([
      client.variant.findMany({
        where: { setId: set.id, product: "Booster", finish: "Standard" },
        select: {
          id: true,
          cardId: true,
          slug: true,
          finish: true,
          product: true,
        },
      }),
      client.variant.findMany({
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

  // Group by rarity using meta map
  const stdByRarity: Record<Rarity, VariantSel[]> = {
    Ordinary: [],
    Exceptional: [],
    Elite: [],
    Unique: [],
  };
  for (const v of variantsStd) {
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    stdByRarity[meta.rarity].push(v);
  }

  const foilByRarity: Record<Rarity, VariantSel[]> = {
    Ordinary: [],
    Exceptional: [],
    Elite: [],
    Unique: [],
  };
  for (const v of variantsFoil) {
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    foilByRarity[meta.rarity].push(v);
  }

  // Site/Avatar pool (standard only) for sets that use an extra slot (Alpha)
  const siteAvatarCardIds: number[] = [];
  for (const m of metas) {
    const t = m.type?.toLowerCase() ?? "";
    if (t.includes("site") || t.includes("avatar"))
      siteAvatarCardIds.push(m.cardId);
  }
  const siteAvatarStd = variantsStd.filter((v) =>
    siteAvatarCardIds.includes(v.cardId)
  );

  const picks: BoosterCard[] = [];
  const used = new Set<number>(); // track cardIds to prevent duplicates in a pack

  // Top rarity slot (Elite or Unique)
  const pickUnique = Math.random() < cfg.uniqueChance;
  const topPool = pickUnique ? stdByRarity.Unique : stdByRarity.Elite;
  const topVariant =
    pickUniqueFrom(topPool, used) ??
    pickUniqueFrom(stdByRarity.Elite, used) ??
    pickUniqueFrom(stdByRarity.Unique, used);
  if (topVariant) {
    const meta = metaByCardId.get(topVariant.cardId);
    if (meta) {
      picks.push(toBoosterCard(topVariant, meta));
      used.add(topVariant.cardId);
    }
  }

  // Exceptional slots
  for (let i = 0; i < cfg.exceptionalCount; i++) {
    const v = pickUniqueFrom(stdByRarity.Exceptional, used);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    picks.push(toBoosterCard(v, meta));
    used.add(v.cardId);
  }

  // Ordinary slots
  for (let i = 0; i < cfg.ordinaryCount; i++) {
    const v = pickUniqueFrom(stdByRarity.Ordinary, used);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    picks.push(toBoosterCard(v, meta));
    used.add(v.cardId);
  }

  // Site/Avatar extra slot if configured
  for (let i = 0; i < cfg.siteOrAvatarCount; i++) {
    const v =
      pickUniqueFrom(siteAvatarStd, used) ||
      pickUniqueFrom(stdByRarity.Ordinary, used);
    if (!v) break;
    const meta = metaByCardId.get(v.cardId);
    if (!meta) continue;
    picks.push(toBoosterCard(v, meta));
    used.add(v.cardId);
  }

  // Foil replacement logic (replace one ordinary slot)
  if (cfg.foilChance && Math.random() < cfg.foilChance) {
    const foilRarity = weightedChoice<Rarity>([
      { item: "Unique" as Rarity, weight: cfg.foilUniqueWeight },
      { item: "Elite" as Rarity, weight: cfg.foilEliteWeight },
      { item: "Exceptional" as Rarity, weight: cfg.foilExceptionalWeight },
      { item: "Ordinary" as Rarity, weight: cfg.foilOrdinaryWeight },
    ]);
    const foilPool = foilRarity ? foilByRarity[foilRarity] : [];
    const foil = pickUniqueFrom(foilPool, used);
    if (foil) {
      // Find an ordinary index to replace
      const ordIdx = picks.findIndex((p) => p.rarity === "Ordinary");
      if (ordIdx !== -1) {
        const meta = metaByCardId.get(foil.cardId);
        if (meta) {
          // update used set: remove the replaced ordinary and add the foil card
          used.delete(picks[ordIdx].cardId);
          picks[ordIdx] = toBoosterCard(foil, meta);
          used.add(foil.cardId);
        }
      } else {
        // No ordinary to replace; skip foil to maintain pack size and uniqueness
      }
    }
  }

  // Fill card names in one query
  const ids = Array.from(new Set(picks.map((p) => p.cardId)));
  const cards: { id: number; name: string }[] = await client.card.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map<number, string>();
  for (const c of cards) nameById.set(c.id, c.name);
  for (const p of picks) p.cardName = nameById.get(p.cardId) || "";

  // Avatar replacement logic for Beta/Alpha packs (after names are filled)
  if (replaceAvatars && (setName === "Alpha" || setName === "Beta")) {
    try {
      // Find Sorcerer avatars in picks
      const sorcererIndices: number[] = [];
      for (let i = 0; i < picks.length; i++) {
        const pick = picks[i];
        const meta = metaByCardId.get(pick.cardId);
        if (
          meta?.type?.toLowerCase().includes("avatar") &&
          pick.cardName.toLowerCase().includes("sorcerer")
        ) {
          sorcererIndices.push(i);
        }
      }

      if (sorcererIndices.length > 0) {
        // Get Beta common avatars (Geomancer, Flamecaller, Sparkmage, Waveshaper)
        const betaAvatarNames = [
          "Geomancer",
          "Flamecaller",
          "Sparkmage",
          "Waveshaper",
        ];
        const betaAvatars = await client.card.findMany({
          where: {
            name: { in: betaAvatarNames },
          },
          select: { id: true, name: true },
        });

        if (betaAvatars.length > 0) {
          // Find Beta set for variants
          const betaSet = await client.set.findUnique({
            where: { name: "Beta" },
          });
          if (betaSet) {
            const betaVariants = await client.variant.findMany({
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

            // Replace each Sorcerer with a random Beta avatar
            for (const sorcererIdx of sorcererIndices) {
              const randomAvatar = choice(betaVariants);
              if (randomAvatar) {
                const avatarCard = betaAvatars.find(
                  (c) => c.id === randomAvatar.cardId
                );
                if (avatarCard) {
                  picks[sorcererIdx] = {
                    variantId: randomAvatar.id,
                    slug: randomAvatar.slug,
                    finish: randomAvatar.finish as Finish,
                    product: randomAvatar.product,
                    rarity: "Ordinary", // Beta avatars are ordinary
                    type: "Avatar",
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
      console.error("Avatar replacement failed:", avatarError);
    }
  }

  return picks;
}

export async function generateBoosters(
  setName: string,
  count: number,
  client: PrismaClient = defaultPrisma,
  replaceAvatars = false
) {
  const packs: BoosterCard[][] = [];
  for (let i = 0; i < count; i++) {
    packs.push(await generateBooster(setName, client, replaceAvatars));
  }
  return packs;
}

/**
 * Generate multiple boosters from a cube (random sampling without replacement per pack)
 *
 * Special handling for cube drafts:
 * - Spellslinger is excluded from packs (available as free pick via extras)
 * - Sideboard avatars are included in packs as draftable avatars
 */
export async function generateCubeBoosters(
  cubeId: string,
  count: number,
  packSize = 15,
  client: PrismaClient = defaultPrisma
) {
  // Fetch cube with all cards
  const cube = await client.cube.findUnique({
    where: { id: cubeId },
    include: {
      cards: {
        include: {
          card: {
            select: {
              name: true,
              elements: true,
              meta: {
                select: {
                  setId: true,
                  type: true,
                },
              },
            },
          },
          variant: {
            select: {
              id: true,
              slug: true,
              finish: true,
              product: true,
              cardId: true,
              typeText: true,
            },
          },
          set: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!cube) {
    throw new Error(`Cube not found: ${cubeId}`);
  }

  // Helper to resolve card type from variant or metadata
  const resolveType = (entry: (typeof cube.cards)[number]): string | null => {
    const variantType = entry.variant?.typeText?.trim();
    if (variantType) return variantType;
    const setId = entry.set?.id ?? entry.setId ?? null;
    if (!setId) return null;
    const meta = entry.card?.meta?.find((m) => m.setId === setId);
    return meta?.type ?? null;
  };

  // Helper to check if a card is an avatar
  const isAvatar = (type: string | null): boolean => {
    return type?.toLowerCase().includes("avatar") ?? false;
  };

  // Build working pool with card counts
  // Include: main zone cards (except Spellslinger) + sideboard avatars
  const workingPool: BoosterCard[] = cube.cards.flatMap((entry) => {
    const zone = (entry as { zone?: string | null }).zone ?? "main";
    const cardName = entry.card?.name || "";
    const resolvedType = resolveType(entry);

    // Skip Spellslinger - it's available as a free pick, not draftable
    if (cardName.toLowerCase() === "spellslinger") {
      return [];
    }

    // Include main zone cards
    if (zone === "main") {
      const cardCount = Math.max(0, Number(entry.count) || 0);
      if (cardCount === 0 || !entry.variantId) return [];

      return Array.from(
        { length: cardCount },
        (): BoosterCard => ({
          variantId: entry.variantId as number,
          cardId: entry.cardId,
          slug: entry.variant?.slug || "",
          finish: (entry.variant?.finish as Finish) || "Standard",
          product: entry.variant?.product || "Booster",
          setName: entry.set?.name || "Unknown",
          cardName,
          rarity: "Ordinary",
          type: resolvedType,
        })
      );
    }

    // Include sideboard avatars (they become draftable in packs)
    if (zone === "sideboard" && isAvatar(resolvedType)) {
      const cardCount = Math.max(0, Number(entry.count) || 0);
      if (cardCount === 0 || !entry.variantId) return [];

      return Array.from(
        { length: cardCount },
        (): BoosterCard => ({
          variantId: entry.variantId as number,
          cardId: entry.cardId,
          slug: entry.variant?.slug || "",
          finish: (entry.variant?.finish as Finish) || "Standard",
          product: entry.variant?.product || "Booster",
          setName: entry.set?.name || "Unknown",
          cardName,
          rarity: "Ordinary",
          type: resolvedType,
        })
      );
    }

    return [];
  });

  if (workingPool.length === 0) {
    throw new Error(`Cube ${cubeId} has no cards`);
  }

  const totalCardsNeeded = count * packSize;
  console.log(
    `[Cube Booster] Generating ${count} packs of ${packSize} cards from cube ${cubeId}. ` +
      `Pool has ${workingPool.length} cards (need ${totalCardsNeeded}).`
  );

  if (workingPool.length < totalCardsNeeded) {
    console.warn(
      `[Cube Booster] WARNING: Cube ${cubeId} has ${workingPool.length} cards but ${totalCardsNeeded} are needed. ` +
        `Some packs may be smaller or cards may repeat.`
    );
  }

  // Generate packs by dealing cards without replacement from shuffled pool
  // This respects the actual card counts in the cube (e.g., 1 Philosopher's Stone = only 1 across all packs)
  const packs: BoosterCard[][] = [];
  const shuffled = [...workingPool].sort(() => Math.random() - 0.5);
  let dealIndex = 0;

  for (let i = 0; i < count; i++) {
    const pack: BoosterCard[] = [];

    for (let j = 0; j < packSize; j++) {
      if (dealIndex < shuffled.length) {
        // Deal from the shuffled pool without replacement
        pack.push(shuffled[dealIndex]);
        dealIndex++;
      } else if (shuffled.length > 0) {
        // If we run out of cards, wrap around (fallback for undersized cubes)
        // This is a degraded mode - ideally the cube should have enough cards
        const fallbackIdx = (dealIndex - shuffled.length) % shuffled.length;
        pack.push(shuffled[fallbackIdx]);
        dealIndex++;
      }
    }

    packs.push(pack);
  }

  return packs;
}

/**
 * Get cube sideboard cards that should be available as "extras" (non-avatar sideboard cards only)
 * For cubes like Frogimago's where sideboard avatars are drafted, this returns empty.
 */
export async function getCubeExtrasCards(
  cubeId: string,
  client: PrismaClient = defaultPrisma
): Promise<BoosterCard[]> {
  const cube = await client.cube.findUnique({
    where: { id: cubeId },
    include: {
      cards: {
        where: { zone: "sideboard" },
        include: {
          card: {
            select: {
              name: true,
              meta: {
                select: {
                  setId: true,
                  type: true,
                },
              },
            },
          },
          variant: {
            select: {
              id: true,
              slug: true,
              finish: true,
              product: true,
              cardId: true,
              typeText: true,
            },
          },
          set: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!cube) return [];

  // Filter to only non-avatar sideboard cards
  return cube.cards.flatMap((entry) => {
    const variantType = entry.variant?.typeText?.trim();
    let resolvedType = variantType || null;
    if (!resolvedType) {
      const setId = entry.set?.id ?? entry.setId ?? null;
      if (setId) {
        const meta = entry.card?.meta?.find((m) => m.setId === setId);
        resolvedType = meta?.type ?? null;
      }
    }

    // Skip avatars - they are drafted in packs now
    if (resolvedType?.toLowerCase().includes("avatar")) {
      return [];
    }

    const cardCount = Math.max(0, Number(entry.count) || 0);
    if (cardCount === 0 || !entry.variantId) return [];

    return Array.from(
      { length: cardCount },
      (): BoosterCard => ({
        variantId: entry.variantId as number,
        cardId: entry.cardId,
        slug: entry.variant?.slug || "",
        finish: (entry.variant?.finish as Finish) || "Standard",
        product: entry.variant?.product || "Booster",
        setName: entry.set?.name || "Unknown",
        cardName: entry.card?.name || "",
        rarity: "Ordinary",
        type: resolvedType,
      })
    );
  });
}

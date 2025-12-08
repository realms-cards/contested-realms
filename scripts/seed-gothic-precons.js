#!/usr/bin/env node
/*
Seed Gothic Preconstructed decks from Curiosa as public decks.

Usage:
  node scripts/seed-gothic-precons.js

This script fetches the decks from Curiosa's tRPC API and imports them
as public decks owned by a system user.
*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Gothic precon deck IDs from Curiosa
const GOTHIC_PRECON_IDS = [
  "cmip2w8qa002mjl04intv339z",
  "cmip2vwc100khl2043cgtpae7",
  "cmip2vh9y00kal204778yzvbd",
  "cmip2v28500k6l204a5bxo5oh",
];

// Curiosa tRPC deck entry shape
/**
 * @typedef {{
 *   card: {
 *     id: string;
 *     name: string;
 *     slug: string;
 *     type: string;
 *     category: string;
 *     variants: Array<{ id: string; slug: string }>;
 *   };
 *   variantId: string;
 *   quantity: number;
 * }} CuriosatrpcDeck
 */

/**
 * Fetch deck data from Curiosa tRPC API
 * @param {string} deckId
 * @returns {Promise<{ deckList: CuriosatrpcDeck[], sideboardList: CuriosatrpcDeck[], avatarName: string|null, deckName: string|null } | null>}
 */
async function fetchCuriosatrpc(deckId) {
  if (!deckId) return null;

  const input = JSON.stringify({ json: { id: deckId } });
  const headers = {
    Origin: "https://curiosa.io",
    Referer: "https://curiosa.io/",
    Accept: "application/json",
  };

  try {
    // Fetch deck list, sideboard, and deck metadata in parallel
    const [listRes, sideboardRes, metaRes] = await Promise.all([
      fetch(
        `https://curiosa.io/api/trpc/deck.getDecklistById?input=${encodeURIComponent(
          input
        )}`,
        { headers }
      ),
      fetch(
        `https://curiosa.io/api/trpc/deck.getSideboardById?input=${encodeURIComponent(
          input
        )}`,
        { headers }
      ),
      fetch(
        `https://curiosa.io/api/trpc/deck.getById?input=${encodeURIComponent(
          input
        )}`,
        { headers }
      ),
    ]);

    if (!listRes.ok) return null;

    const listData = await listRes.json();
    const deckList = listData?.result?.data?.json;
    if (!Array.isArray(deckList)) return null;

    // Parse sideboard (Collection zone) - avatar is also stored here
    let sideboardList = [];
    if (sideboardRes.ok) {
      const sideboardData = await sideboardRes.json();
      const sbList = sideboardData?.result?.data?.json;
      if (Array.isArray(sbList)) {
        sideboardList = sbList;
      }
    }

    // Extract avatar from sideboard (first Avatar type card)
    let avatarName = null;
    for (const entry of sideboardList) {
      if (entry.card?.type?.toLowerCase() === "avatar") {
        avatarName = entry.card.name;
        break;
      }
    }

    // Fallback: try metadata avatars array
    let deckName = null;
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const meta = metaData?.result?.data?.json;
      if (meta) {
        deckName = meta.name || null;
        // Avatar fallback from avatars array
        if (!avatarName) {
          const avatars = meta.avatars;
          if (Array.isArray(avatars) && avatars.length > 0) {
            avatarName = avatars[0]?.card?.name || null;
          }
        }
      }
    }

    return { deckList, sideboardList, avatarName, deckName };
  } catch (err) {
    console.error(`[Gothic] Error fetching deck ${deckId}:`, err.message);
    return null;
  }
}

/**
 * Import a deck from Curiosa tRPC data
 * @param {CuriosatrpcDeck[]} deckList
 * @param {CuriosatrpcDeck[]} sideboardList
 * @param {string|null} avatarName
 * @param {string} userId
 * @param {string} deckName
 * @returns {Promise<{ error?: string; deck?: { id: string; name: string } }>}
 */
async function importFromTrpcData(
  deckList,
  sideboardList,
  avatarName,
  userId,
  deckName
) {
  // Build a map of collection card quantities by variantId to subtract from main deck
  const collectionByVariantId = new Map();
  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    if (card.type?.toLowerCase() === "avatar") continue;
    const key = variantId || card.id;
    collectionByVariantId.set(
      String(key),
      (collectionByVariantId.get(String(key)) || 0) + quantity
    );
  }

  // Extract card entries with their variant slugs and zone
  const entries = [];

  // Process main deck, subtracting any collection quantities
  for (const entry of deckList) {
    const { card, variantId, quantity } = entry;
    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || card.slug;

    const key = variantId || card.id;
    const collectionQty = collectionByVariantId.get(String(key)) || 0;
    const mainDeckQty = Math.max(0, quantity - collectionQty);

    if (collectionQty > 0) {
      collectionByVariantId.delete(String(key));
    }

    if (mainDeckQty > 0) {
      entries.push({
        name: card.name,
        slug,
        quantity: mainDeckQty,
        category: card.category,
        type: card.type,
        zone: "main",
      });
    }
  }

  // Process sideboard (Collection zone)
  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    if (card.type?.toLowerCase() === "avatar") continue;

    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || card.slug;

    entries.push({
      name: card.name,
      slug,
      quantity,
      category: card.category,
      type: card.type,
      zone: "sideboard",
    });
  }

  if (entries.length === 0) {
    return { error: "No cards found in Curiosa deck" };
  }

  // Group by slug+zone
  const grouped = new Map();
  for (const e of entries) {
    const key = `${e.slug}:${e.zone}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += e.quantity;
    } else {
      grouped.set(key, { ...e });
    }
  }

  // Map to our DB variants by slug
  const mapped = [];
  const unresolved = [];

  for (const [_key, entry] of grouped) {
    const variant = await prisma.variant.findFirst({
      where: { slug: entry.slug },
      select: { id: true, cardId: true, setId: true, typeText: true },
    });

    if (!variant) {
      // Fallback: try by card name
      const card = await prisma.card.findFirst({
        where: { name: { equals: entry.name, mode: "insensitive" } },
        select: {
          id: true,
          variants: {
            select: { id: true, setId: true, typeText: true },
            take: 1,
          },
        },
      });

      if (!card) {
        unresolved.push({ name: entry.name, count: entry.quantity });
        continue;
      }

      const v = card.variants[0];
      let zone;
      if (entry.zone === "sideboard") {
        zone = "Collection";
      } else {
        const isSite =
          entry.type?.toLowerCase() === "site" ||
          entry.category?.toLowerCase() === "site";
        zone = isSite ? "Atlas" : "Spellbook";
      }
      mapped.push({
        cardId: card.id,
        variantId: v?.id ?? null,
        setId: v?.setId ?? null,
        zone,
        count: entry.quantity,
        name: entry.name,
      });
    } else {
      let zone;
      if (entry.zone === "sideboard") {
        zone = "Collection";
      } else {
        const isSite =
          entry.type?.toLowerCase() === "site" ||
          entry.category?.toLowerCase() === "site";
        zone = isSite ? "Atlas" : "Spellbook";
      }
      mapped.push({
        cardId: variant.cardId,
        variantId: variant.id,
        setId: variant.setId,
        zone,
        count: entry.quantity,
        name: entry.name,
      });
    }
  }

  if (unresolved.length > 0) {
    console.warn(
      `[Gothic] Warning: Could not resolve some cards:`,
      unresolved.map((u) => u.name).join(", ")
    );
  }

  // Handle avatar
  if (!avatarName) {
    return {
      error: "Deck requires exactly 1 Avatar (none found in Curiosa deck)",
    };
  }

  const avatarCard = await prisma.card.findFirst({
    where: { name: { equals: avatarName, mode: "insensitive" } },
    select: {
      id: true,
      variants: { select: { id: true, setId: true }, take: 1 },
    },
  });

  if (!avatarCard) {
    return { error: `Avatar "${avatarName}" not found in database` };
  }

  const avatarVariant = avatarCard.variants[0];
  mapped.push({
    cardId: avatarCard.id,
    variantId: avatarVariant?.id ?? null,
    setId: avatarVariant?.setId ?? null,
    zone: "Spellbook",
    count: 1,
    name: avatarName,
  });

  // Check if deck already exists
  let deck = await prisma.deck.findFirst({ where: { userId, name: deckName } });

  if (!deck) {
    deck = await prisma.deck.create({
      data: {
        name: deckName,
        format: "Constructed",
        imported: true,
        isPublic: true,
        user: { connect: { id: userId } },
      },
    });
    console.log(`[Gothic] Created deck "${deckName}" (${deck.id})`);
  } else {
    await prisma.deck.update({
      where: { id: deck.id },
      data: { isPublic: true, imported: true, format: "Constructed" },
    });
    console.log(`[Gothic] Updating deck "${deckName}" (${deck.id})`);
  }

  // Aggregate by (cardId, zone, variantId)
  const agg = new Map();
  for (const m of mapped) {
    const key = `${m.cardId}:${m.zone}:${m.variantId ?? "x"}`;
    const prev = agg.get(key);
    if (prev) {
      prev.count += m.count;
    } else {
      agg.set(key, { ...m });
    }
  }

  // Delete existing cards and create new ones
  await prisma.$transaction(async (tx) => {
    await tx.deckCard.deleteMany({ where: { deckId: deck.id } });
    await tx.deckCard.createMany({
      data: Array.from(agg.values()).map((m) => ({
        deckId: deck.id,
        cardId: m.cardId,
        variantId: m.variantId,
        setId: m.setId,
        zone: m.zone,
        count: m.count,
      })),
    });
  });

  const totalCards = Array.from(agg.values()).reduce(
    (sum, m) => sum + m.count,
    0
  );
  console.log(
    `[Gothic] Upserted "${deckName}" with ${agg.size} unique entries (${totalCards} total cards)`
  );

  return { deck: { id: deck.id, name: deck.name } };
}

async function main() {
  // Ensure a dedicated system user exists for public decks
  const SYSTEM_EMAIL = "public-decks@system.local";
  const SYSTEM_NAME = "Public Decks";

  let systemUser = await prisma.user.findFirst({
    where: { email: SYSTEM_EMAIL },
  });

  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: { email: SYSTEM_EMAIL, name: SYSTEM_NAME, isPro: false },
    });
    console.log(
      `[Gothic] Created system user ${systemUser.id} (${SYSTEM_EMAIL})`
    );
  }

  const userId = systemUser.id;
  console.log(
    `[Gothic] Seeding ${GOTHIC_PRECON_IDS.length} Gothic preconstructed decks owned by system user '${SYSTEM_NAME}' (public).`
  );

  for (const deckId of GOTHIC_PRECON_IDS) {
    console.log(`[Gothic] Fetching deck ${deckId} from Curiosa...`);

    const trpcData = await fetchCuriosatrpc(deckId);
    if (!trpcData) {
      console.error(`[Gothic] Failed to fetch deck ${deckId}`);
      continue;
    }

    const deckName = trpcData.deckName || `Gothic Precon ${deckId.slice(-6)}`;

    const result = await importFromTrpcData(
      trpcData.deckList,
      trpcData.sideboardList,
      trpcData.avatarName,
      userId,
      deckName
    );

    if (result.error) {
      console.error(`[Gothic] Error importing deck ${deckId}: ${result.error}`);
    }
  }

  console.log("[Gothic] Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

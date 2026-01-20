#!/usr/bin/env node
/*
  Seed Frogimago's cubes for draft:
  - "Frogimago's Cube" - Latest version fetched from Curiosa (Gothic era)
  - "Frogimago's Pre Gothic Cube" - Legacy version with Arthurian/Alpha/Beta cards

  Usage:
    node scripts/seed-public-cube-frogimagos.js

  Notes:
    - Requires cards to be ingested first (npm run ingest:cards).
    - Creates or updates Cubes owned by a dedicated system user and marks them isPublic=true.
    - If any card names cannot be resolved against the DB, the script will warn and skip them.
*/

// Load .env for local development
try {
  require("dotenv").config();
} catch {}

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// New Gothic cube - fetched from Curiosa
const NEW_CUBE_NAME = "Frogimago's Cube";
const NEW_CUBE_URL = "https://curiosa.io/decks/cm7cfadx00017l7030f2uyd1g";
const NEW_CUBE_DECK_ID = "cm7cfadx00017l7030f2uyd1g";

// Legacy pre-Gothic cube - also fetched from Curiosa
const LEGACY_CUBE_NAME = "Frogimago's Pre Gothic Cube";
const LEGACY_CUBE_URL = "https://curiosa.io/decks/cmiva56uv470805ebmocxz4s2";
const LEGACY_CUBE_DECK_ID = "cmiva56uv470805ebmocxz4s2";

// ---- Name canonicalization and batch variant lookup ----

function canonicalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s\-\u2013\u2014_,:;.!?()/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

async function batchFindVariants(names, setPreference) {
  const result = new Map();
  if (!names.length) return result;

  const candidates = await prisma.card.findMany({
    where: {
      name: {
        in: names.flatMap((name) => {
          const canon = canonicalize(name);
          return [name, canon];
        }),
      },
    },
    select: {
      id: true,
      name: true,
      variants: {
        select: {
          id: true,
          setId: true,
          set: { select: { name: true } },
        },
      },
    },
  });

  for (const name of names) {
    const canon = canonicalize(name);
    const matches = candidates.filter(
      (c) => canonicalize(c.name) === canon || c.name === name,
    );
    if (!matches.length) continue;

    let chosenVariant = null;

    for (const preferredSet of setPreference) {
      const withPreferred = matches
        .flatMap((candidate) =>
          candidate.variants.map((variant) => ({
            cardId: candidate.id,
            id: variant.id,
            setId: variant.setId,
            setName: (variant.set && variant.set.name) || null,
          })),
        )
        .find((variant) => variant.setName === preferredSet);

      if (withPreferred) {
        chosenVariant = {
          cardId: withPreferred.cardId,
          id: withPreferred.id,
          setId: withPreferred.setId,
        };
        break;
      }
    }

    if (!chosenVariant) {
      const fallback = matches[0];
      const fallbackVariant = fallback.variants[0];
      chosenVariant = fallbackVariant
        ? {
            cardId: fallback.id,
            id: fallbackVariant.id,
            setId: fallbackVariant.setId,
          }
        : { cardId: fallback.id, id: null, setId: null };
    }

    result.set(name, {
      cardId: chosenVariant.cardId,
      variantId: chosenVariant.id,
      setId: chosenVariant.setId,
    });
  }

  return result;
}

// ---- Curiosa tRPC fetch (adapted from seed-gothic-precons.js) ----

/**
 * Fetch deck/cube data from Curiosa tRPC API
 * @param {string} deckId
 * @returns {Promise<{ deckList: Array<{card: {id: string, name: string, slug: string, type: string, category: string, variants: Array<{id: string, slug: string}>}, variantId: string, quantity: number}>, sideboardList: Array<object>, deckName: string|null } | null>}
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
          input,
        )}`,
        { headers },
      ),
      fetch(
        `https://curiosa.io/api/trpc/deck.getSideboardById?input=${encodeURIComponent(
          input,
        )}`,
        { headers },
      ),
      fetch(
        `https://curiosa.io/api/trpc/deck.getById?input=${encodeURIComponent(
          input,
        )}`,
        { headers },
      ),
    ]);

    if (!listRes.ok) return null;

    const listData = await listRes.json();
    const deckList = listData?.result?.data?.json;
    if (!Array.isArray(deckList)) return null;

    // Parse sideboard (Collection zone)
    let sideboardList = [];
    if (sideboardRes.ok) {
      const sideboardData = await sideboardRes.json();
      const sbList = sideboardData?.result?.data?.json;
      if (Array.isArray(sbList)) {
        sideboardList = sbList;
      }
    }

    // Get deck name from metadata
    let deckName = null;
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const meta = metaData?.result?.data?.json;
      if (meta) {
        deckName = meta.name || null;
      }
    }

    return { deckList, sideboardList, deckName };
  } catch (err) {
    console.error(`[CubeSeed] Error fetching deck ${deckId}:`, err.message);
    return null;
  }
}

/**
 * Import cube from Curiosa tRPC data
 * @param {Array} deckList - List of cards from Curiosa
 * @param {Array} sideboardList - Sideboard/collection cards from Curiosa
 * @param {string} userId - System user ID
 * @param {string} cubeName - Name for the cube
 * @param {string} cubeDescription - Description for the cube
 * @param {string[]} setPreference - Preferred sets for variant selection
 * @returns {Promise<{ error?: string; cube?: { id: string; name: string } }>}
 */
async function importCubeFromTrpcData(
  deckList,
  sideboardList,
  userId,
  cubeName,
  cubeDescription,
  setPreference,
) {
  // Extract all card entries with their names and quantities
  const entries = [];

  // Process main deck cards
  for (const entry of deckList) {
    const { card, quantity } = entry;
    entries.push({
      name: card.name,
      quantity,
      zone: "main",
    });
  }

  // Process sideboard (avatars for cube)
  for (const entry of sideboardList) {
    const { card, quantity } = entry;
    entries.push({
      name: card.name,
      quantity,
      zone: "sideboard",
    });
  }

  if (entries.length === 0) {
    return { error: "No cards found in Curiosa cube" };
  }

  // Group by name+zone and sum quantities
  const grouped = new Map();
  for (const e of entries) {
    const key = `${e.name}:${e.zone}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += e.quantity;
    } else {
      grouped.set(key, { ...e });
    }
  }

  // Get unique names for batch lookup
  const uniqueNames = [
    ...new Set(Array.from(grouped.values()).map((e) => e.name)),
  ];
  console.log(
    `[CubeSeed] Unique card names from Curiosa: ${uniqueNames.length}`,
  );

  // Batch lookup variants
  const nameToVariant = await batchFindVariants(uniqueNames, setPreference);

  // Map to our DB
  const cardRows = [];
  const unresolved = [];

  for (const [_key, entry] of grouped) {
    const found = nameToVariant.get(entry.name);
    if (!found) {
      unresolved.push({ name: entry.name, count: entry.quantity });
      continue;
    }
    cardRows.push({
      cardId: found.cardId,
      setId: found.setId,
      variantId: found.variantId,
      count: entry.quantity,
      name: entry.name,
      zone: entry.zone,
    });
  }

  if (unresolved.length > 0) {
    console.warn(
      `[CubeSeed] Warning: Could not resolve some cards:`,
      unresolved.map((u) => `${u.name} (${u.count})`).join(", "),
    );
  }

  if (cardRows.length === 0) {
    return { error: "No cards could be resolved from Curiosa cube" };
  }

  const totalCards = cardRows.reduce((sum, r) => sum + r.count, 0);
  console.log(
    `[CubeSeed] Resolved ${cardRows.length} unique cards (${totalCards} total copies).`,
  );

  // Check if cube already exists
  let cube = await prisma.cube.findFirst({ where: { userId, name: cubeName } });

  if (!cube) {
    cube = await prisma.cube.create({
      data: {
        userId,
        name: cubeName,
        description: cubeDescription,
        isPublic: true,
        imported: true,
      },
    });
    console.log(`[CubeSeed] Created cube "${cubeName}" (${cube.id})`);
  } else {
    cube = await prisma.cube.update({
      where: { id: cube.id },
      data: {
        description: cubeDescription,
        isPublic: true,
        imported: true,
      },
    });
    console.log(`[CubeSeed] Updating existing cube "${cubeName}" (${cube.id})`);
  }

  // Delete existing cards and create new ones
  await prisma.$transaction(async (tx) => {
    await tx.cubeCard.deleteMany({ where: { cubeId: cube.id } });
    if (cardRows.length) {
      await tx.cubeCard.createMany({
        data: cardRows.map((r) => ({
          cubeId: cube.id,
          cardId: r.cardId,
          setId: r.setId,
          variantId: r.variantId,
          count: r.count,
          zone: r.zone,
        })),
      });
    }
  });

  console.log(
    `[CubeSeed] Upserted cube "${cubeName}" with ${cardRows.length} unique entries (${totalCards} total cards).`,
  );

  return { cube: { id: cube.id, name: cube.name } };
}

// ---- Cube seeding logic ----

async function seedLegacyCube(userId) {
  console.log(`[CubeSeed] Fetching legacy cube from Curiosa: ${LEGACY_CUBE_URL}`);

  // First, check if there's an existing cube named "Frogimago's Cube" and rename it
  const existingCube = await prisma.cube.findFirst({
    where: { userId, name: "Frogimago's Cube" },
  });

  if (existingCube) {
    // Rename to legacy name before fetching new data
    await prisma.cube.update({
      where: { id: existingCube.id },
      data: { name: LEGACY_CUBE_NAME },
    });
    console.log(
      `[CubeSeed] Renamed existing "Frogimago's Cube" to "${LEGACY_CUBE_NAME}" (${existingCube.id})`,
    );
  }

  const trpcData = await fetchCuriosatrpc(LEGACY_CUBE_DECK_ID);
  if (!trpcData) {
    console.error(`[CubeSeed] Failed to fetch legacy cube from Curiosa`);
    return;
  }

  const cubeDescription = trpcData.deckName
    ? `${trpcData.deckName} - Legacy cube built by Frogimago (Pre-Gothic, Arthurian/Alpha/Beta).`
    : "Legacy cube built by Frogimago - Pre-Gothic version (Arthurian/Alpha/Beta).";

  const result = await importCubeFromTrpcData(
    trpcData.deckList,
    trpcData.sideboardList,
    userId,
    LEGACY_CUBE_NAME,
    cubeDescription,
    ["Arthurian Legends", "Beta", "Alpha", "Dragonlord"],
  );

  if (result.error) {
    console.error(`[CubeSeed] Error importing legacy cube: ${result.error}`);
  }
}

async function seedNewCubeFromCuriosa(userId) {
  console.log(`[CubeSeed] Fetching new cube from Curiosa: ${NEW_CUBE_URL}`);

  const trpcData = await fetchCuriosatrpc(NEW_CUBE_DECK_ID);
  if (!trpcData) {
    console.error(`[CubeSeed] Failed to fetch cube from Curiosa`);
    return;
  }

  const cubeDescription = trpcData.deckName
    ? `${trpcData.deckName} - Public cube built by Frogimago (updated for Gothic).`
    : "Public cube built by Frogimago - Gothic update";

  const result = await importCubeFromTrpcData(
    trpcData.deckList,
    trpcData.sideboardList,
    userId,
    NEW_CUBE_NAME,
    cubeDescription,
    ["Gothic", "Arthurian Legends", "Beta", "Alpha", "Dragonlord"],
  );

  if (result.error) {
    console.error(`[CubeSeed] Error importing cube: ${result.error}`);
  }
}

async function main() {
  const SYSTEM_EMAIL = "public-cubes@system.local";
  const SYSTEM_NAME = "Public Cubes";

  let systemUser = await prisma.user.findFirst({
    where: { email: SYSTEM_EMAIL },
  });
  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: { email: SYSTEM_EMAIL, name: SYSTEM_NAME, isPro: false },
    });
    console.log(
      `[CubeSeed] Created system user ${systemUser.id} (${SYSTEM_EMAIL})`,
    );
  }
  const userId = systemUser.id;

  console.log(
    `[CubeSeed] Seeding Frogimago's cubes owned by '${SYSTEM_NAME}' (public).`,
  );

  // 1. Seed/rename legacy cube (Pre Gothic)
  await seedLegacyCube(userId);

  // 2. Fetch and seed new cube from Curiosa (Gothic)
  await seedNewCubeFromCuriosa(userId);

  console.log("[CubeSeed] Done.");
}

main()
  .catch((err) => {
    console.error("[CubeSeed] Failed:", err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

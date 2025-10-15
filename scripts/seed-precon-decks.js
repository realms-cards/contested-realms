#!/usr/bin/env node
/*
Seed 4 Beta Preconstructed decks (one per element) as public Constructed decks.

Usage:
  node scripts/seed-precon-decks.js

What to paste:
  - Either fill BETA_PRECONS with arrays (spellbook/atlas/sideboard),
  - Or paste a raw decklist text (like the one you provided) into parsePreconFromText(...).

Notes:
  - The schema requires a user owner. We create/find a dedicated system user "Public Decks" and assign decks to it with isPublic=true.
  - Deck validation: warns if <50 spellbook or <30 atlas.
  - Existing decks with the same name are updated in-place.
*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const FIRE_TEXT = `
Avatar (1)
1 Flamecaller

Aura (1)
1 Wildfire

Magic (35)
1 Askelon Phoenix
1 Blaze
1 Clamor of Harpies
1 Colicky Dragonettes
1 Cone of Flame
1 Escyllion Cyclops
1 Fireball
2 Firebolts
1 Heat Ray
1 Hillock Basilisk
1 Incinerate
1 Infernal Legion
1 Lava Salamander
1 Mad Dash
1 Major Explosion
2 Minor Explosion
3 Ogre Goons
1 Petrosian Cavalry
2 Pit Vipers
1 Quarrelsome Kobolds
2 Raal Dromedary
2 Rimland Nomads
2 Sacred Scarabs
2 Sand Worm
2 Wayfaring Pilgrim

Site (16)
4 Arid Desert
1 Cornerstone
4 Red Desert
4 Remote Desert
2 Shifting Sands
1 Vesuvius
`;

const EARTH_TEXT = `
Avatar (1)
1 Geomancer

Aura (1)
1 Entangle Terrain

Magic (35)
2 Amazon Warriors
2 Autumn Unicorn
3 Belmotte Longbowmen
1 Border Militia
2 Bury
3 Cave Trolls
1 Cave-In
1 Craterize
1 Dalcean Phalanx
1 Divine Healing
2 House Arn Bannerman
1 King of the Realm
2 Land Surveyor
1 Mountain Giant
2 Overpower
1 Payload Trebuchet
1 Pudge Butcher
1 Rolling Boulder
2 Scent Hounds
1 Siege Ballista
1 Slumbering Giantess
2 Wild Boars
1 Wraetannis Titan

Site (16)
1 Bedrock
1 Holy Ground
3 Humble Village
2 Quagmire
3 Rustic Village
3 Simple Village
1 Sinkhole
2 Vantage Hills
`;

const AIR_TEXT = `Avatar (1)
1 Sparkmage

Aura (1)
1 Thunderstorm

Magic (35)
2 Apprentice Wizard
2 Blink
2 Chain Lightning
2 Cloud Spirit
2 Dead of Night Demon
1 Grandmaster Wizard
1 Gyre Hippogriffs
2 Headless Haunt
1 Highland Clansmen
1 Kite Archer
3 Lightning Bolt
1 Lucky Charm
2 Midnight Rogue
1 Nimbus Jinn
2 Plumed Pegasus
1 Raise Dead
1 Roaming Monster
1 Skirmishers of Mu
1 Sling Pixies
2 Snow Leopard
2 Spectral Stalker
1 Spire Lich
1 Teleport

Site (16)
1 Cloud City
3 Dark Tower
3 Gothic Tower
3 Lone Tower
2 Mountain Pass
1 Observatory
1 Planar Gate
2 Updraft Ridge
`;

const WATER_TEXT = `Avatar (1)
1 Waveshaper

Aura (2)
1 Flood
1 Mariner's Curse

Magic (34)
2 Anui Undine
1 Brobdingnag Bullfrog
2 Coral-Reef Kelpie
2 Deep-Sea Mermaids
1 Diluvian Kraken
2 Drown
1 Font of Life
1 Guile Sirens
2 Ice Lance
2 Pirate Ship
2 Polar Bears
1 Porcupine Pufferfish
2 Riptide
2 Sea Serpent
1 Sedge Crabs
1 Seirawan Hydra
1 Stormy Seas
1 Sunken Treasure
2 Swamp Buffalo
1 Swan Maidens
2 Tide Naiads
1 Tufted Turtles
1 Wrath of the Sea

Site (16)
3 Autumn River
2 Floodplain
1 Island Leviathan
1 Maelström
3 Spring River
3 Summer River
3 Undertow
`;

// ---- PASTE DECK LISTS HERE --------------------------------------------------
// Example format:
// {
//   name: 'Beta Precon – Earth',
//   spellbook: [ { name: 'Geomancer', count: 1 }, { name: 'Assorted Animals', count: 2 } ],
//   atlas:     [ { name: 'Valley', count: 12 }, { name: 'Wasteland', count: 8 } ],
//   sideboard: [ { name: 'Sample Card', count: 2 } ]
// }
/** @type {Array<{ name: string, spellbook: Array<{name:string,count:number}>, atlas: Array<{name:string,count:number}>, sideboard?: Array<{name:string,count:number}> }>} */
const BETA_PRECONS = [
  {
    name: "Beta Precon – Air",
    ...parsePreconFromText(AIR_TEXT),
  },
  {
    name: "Beta Precon – Water",
    ...parsePreconFromText(WATER_TEXT),
  },
  {
    name: "Beta Precon – Earth",
    ...parsePreconFromText(EARTH_TEXT),
  },
  // Example: parse raw text for Fire precon if easier. Replace `FIRE_TEXT` with your pasted list.
  // You can also fill arrays above directly instead of using the parser.
  // The parser maps Avatar/Magic/Aura to spellbook and Site to atlas.
  // { name: 'Beta Precon – Fire', ...parsePreconFromText(FIRE_TEXT) },
  { name: "Beta Precon – Fire", ...parsePreconFromText(FIRE_TEXT) },
];

function parsePreconFromText(text) {
  const lines = String(text || "").split(/\r?\n/);
  /** @type {Array<{name:string,count:number}>} */
  const spellbook = [];
  /** @type {Array<{name:string,count:number}>} */
  const atlas = [];
  let mode = null; // 'spell' | 'site'
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^avatar\b/i.test(line)) {
      mode = "spell";
      continue;
    }
    if (/^magic\b/i.test(line)) {
      mode = "spell";
      continue;
    }
    if (/^aura\b/i.test(line)) {
      mode = "spell";
      continue;
    }
    if (/^site\b/i.test(line)) {
      mode = "site";
      continue;
    }
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const count = Math.max(1, parseInt(m[1], 10) || 1);
    const name = m[2].trim();
    if (!name) continue;
    if (mode === "site") atlas.push({ name, count });
    else spellbook.push({ name, count });
  }
  return { spellbook, atlas, sideboard: [] };
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
      `[Precons] Created system user ${systemUser.id} (${SYSTEM_EMAIL})`
    );
  }
  const userId = systemUser.id;
  console.log(
    `[Precons] Seeding 4 Beta preconstructed decks owned by system user '${SYSTEM_NAME}' (public).`
  );

  const setBeta = await prisma.set.findUnique({ where: { name: "Beta" } });
  if (!setBeta) {
    console.warn(
      "[Precons] Warning: Set 'Beta' not found in DB. Will fall back to first available set/variant for each card."
    );
  }

  for (const deckDef of BETA_PRECONS) {
    await upsertDeck(userId, deckDef, setBeta?.id || null);
  }

  console.log("[Precons] Done.");
}

async function upsertDeck(userId, deckDef, betaSetId) {
  const name = String(deckDef.name || "").trim();
  if (!name) throw new Error("Deck name missing in definition");

  // Resolve all entries to DB rows
  const spellbookRows = await resolveList(deckDef.spellbook || [], betaSetId);
  const atlasRows = await resolveList(deckDef.atlas || [], betaSetId);
  const sideRows = await resolveList(deckDef.sideboard || [], betaSetId);

  // Validate composition (Constructed rules)
  validateConstructedOrWarn(name, spellbookRows, atlasRows);

  // Prepare createMany payload
  const toCreate = [];
  pushRows(toCreate, "Spellbook", spellbookRows);
  pushRows(toCreate, "Atlas", atlasRows);
  pushRows(toCreate, "Sideboard", sideRows);

  // Upsert deck (update if exists by name for user)
  let deck = await prisma.deck.findFirst({ where: { userId, name } });
  if (!deck) {
    deck = await prisma.deck.create({
      data: {
        userId,
        name,
        isPublic: true,
        imported: true,
        format: "Constructed",
      },
    });
    console.log(`[Precons] Created deck ${name} (${deck.id})`);
  } else {
    // ensure public/imported/format on pre-existing deck
    await prisma.deck.update({
      where: { id: deck.id },
      data: { isPublic: true, imported: true, format: "Constructed" },
    });
    console.log(`[Precons] Updating deck ${name} (${deck.id})`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.deckCard.deleteMany({ where: { deckId: deck.id } });
    if (toCreate.length) {
      await tx.deckCard.createMany({
        data: toCreate.map((it) => ({ ...it, deckId: deck.id })),
      });
    }
  });

  // Final counts
  const totals = sumCounts(spellbookRows) + sumCounts(atlasRows);
  console.log(
    `[Precons] Upserted ${name} with ${toCreate.length} unique entries (${totals} total cards).`
  );
}

function pushRows(out, zone, rows) {
  for (const r of rows)
    out.push({
      zone,
      count: r.count,
      cardId: r.cardId,
      setId: r.setId,
      variantId: r.variantId,
    });
}

function sumCounts(rows) {
  return rows.reduce((a, r) => a + (r.count || 0), 0);
}

async function resolveList(list, betaSetId) {
  const out = [];
  for (const entry of list) {
    const name = String(entry?.name || "").trim();
    const count = Math.max(1, Number(entry?.count || 1));
    if (!name) continue;
    const resolved = await resolveCardByName(name, betaSetId);
    if (!resolved) {
      console.warn(`[Precons] WARN: Could not resolve card by name: ${name}`);
      continue;
    }
    out.push({ count, ...resolved });
  }
  return out;
}

async function resolveCardByName(name, betaSetId) {
  const card = await prisma.card.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    include: { meta: true, variants: true },
  });
  if (!card) return null;
  // Prefer Beta meta/variant
  let setId = null;
  let variantId = null;
  if (betaSetId) {
    const metaBeta = card.meta.find((m) => m.setId === betaSetId) || null;
    const variantBeta =
      card.variants.find((v) => v.setId === betaSetId) || null;
    if (metaBeta) setId = metaBeta.setId;
    if (variantBeta) variantId = variantBeta.id;
  }
  // Fallback: any available
  if (setId == null && card.meta.length) setId = card.meta[0].setId;
  if (variantId == null && card.variants.length)
    variantId = card.variants[0].id;
  return { cardId: card.id, setId, variantId };
}

function validateConstructedOrWarn(deckName, spellbookRows, atlasRows) {
  // Avatar detection via CardSetMetadata.type contains 'Avatar' (but we only have ids here)
  // We cannot cheaply check types without an extra query per row; accept approximate check by name includes known avatars.
  const avatarLikeNames = new Set([
    "spellslinger",
    "geomancer",
    "flamecaller",
    "sparkmage",
    "waveshaper",
    "archmage",
    "wizard",
    "warlock",
  ]);
  let avatarCount = 0;
  for (const r of spellbookRows) {
    // This is approximate (we don't have names here); leave avatar check to API or user verification.
    // We still try to approximate using variant/cardId later if desired.
    // For now, just skip strict check and print total counts only.
  }
  const spellCount = sumCounts(spellbookRows);
  const atlasCount = sumCounts(atlasRows);
  if (spellCount < 50 || atlasCount < 30) {
    console.warn(
      `[Precons] WARNING: ${deckName} might be invalid for Constructed (Spellbook=${spellCount}, Atlas=${atlasCount}).`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

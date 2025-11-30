#!/usr/bin/env node
/*
  Seed a specific public cube for draft, based on a curated Arthurian/Beta card list.

  Usage:
    node scripts/seed-public-cube-arthurian.js

  Notes:
    - Requires cards to be ingested first (npm run ingest:cards).
    - Creates or updates a Cube owned by a dedicated system user and marks it isPublic=true.
    - If any card names cannot be resolved against the DB, the script will abort and list them.
*/

// Load .env for local development
try {
  require("dotenv").config();
} catch {}

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CUBE_NAME = "Frogimago's Cube";
const CUBE_DESCRIPTION =
  "Public cube built by Frogimago - contains playables only (from Arthurian Legends, Alpha and Beta).";

/**
 * Cleaned-up cube list in Curiosa-style text format.
 * Each category header is followed by lines like "1Card Name" (quantity + name).
 */
const CUBE_TEXT = `
Avatar (1)
1Spellslinger

Aura (7)
1Crusade
1Jihad
1Mariner's Curse
1The Black Plague
1The Great Famine
1Thunderstorm
1Atlantean Fate

Artifact (36)
1Amethyst Core
1Aquamarine Core
1Erik's Curiosa
1Kythera Mechanism
1Mix Aer
1Mix Aqua
1Mix Ignis
1Mix Terra
1Onyx Core
1Philosopher's Stone
1Ring of Morrigan
1Ruby Core
1Torshammar Trinket
1Excalibur
1Four Waters of Paradise
1Pnakotic Manuscript
1Poisonous Dagger
1Shrine of the Dragonlord
1Angel's Egg
1Black Obelisk
1Devil's Egg
1Goswhit Helmet
1Grim Guisarme
1Iron Shackles
1Screaming Skull
1Seven-League Boots
1Sword and Shield
1 13 Treasures of Britain
1Fail-not Bow
1Mask of Mayhem
1Pendragon Banner
1Rhongomyniad
1Rolling Boulder
1Drums of Doom
1Love Potion
1Pendulum of Peril

Minion (188)
1Pit Vipers
1Porcupine Pufferfish
1Redbreast Robin
1Sedge Crabs
1Sly Fox
1Adept Illusionist
1Bosk Troll
1Cloud Spirit
1Dwarven Digging Team
1Fine Courser
1Finwife
1Frontier Settlers
1Grim Reaper
1Highland Falconer
1Highland Princess
1Kettletop Leprechaun
1Lady Iseult
1Land Surveyor
1Master Tracker
1Palliburrie Bats
1Polar Explorers
1Rimland Nomads
1Sacred Scarabs
1Shellycoat
1Sherwood Huntress
1Sir Tom Thumb
1Sirocco Scorpions
1Sisters of Avalon
1Sneak Thief
1Spectral Stalker
1Sugarplum Pixies
1Swan Maidens
1Swiven Scout
1Tide Naiads
1Tooth Faeries
1Unland Eel
1Vile Imp
1Vril Revenant
1War Horse
1Accursed Albatross
1Albespine Pikemen
1Autumn Unicorn
1Band of Thieves
1Belmotte Longbowmen
1Blue Knight
1Bluecap Knockers
1Brobdingnag Bullfrog
1Cave Trolls
1Cerberus in Chains
1Colicky Dragonettes
1Coral-Reef Kelpie
1Coy Nixie
1Crown Prince
1Fey Changeling
1Field Laborers
1Guile Sirens
1Haast Eagle
1Harassing Ruffians
1Headless Haunt
1Lugbog Cat
1Megamoeba
1Merlin
1Morgana le Fay
1Nelly Longarms
1Phase Assassin
1Plumed Pegasus
1Purple Knight
1Quarrelsome Kobolds
1Reckless Squire
1Redcap Powries
1Ribble Boggart
1Root Spider
1Sea Raider
1Shameless Squire
1Shield Maidens
1Sir Agravaine
1Sir Bors the Younger
1Sir Pelleas
1Slumbering Giantess
1Squirming Mass
1Swindler Troupe
1The Lady of the Lake
1Tufted Turtles
1Vanguard Knights
1Verdant Knight
1Weightless Squire
1White Hart
1Yellow Knight
1Yourke Crossbowmen
1Boudicca
1Brother Knight
1Brown Bears
1Captain Baldassare
1Clamor of Harpies
1Dalcean Phalanx
1Gyre Hippogriffs
1Hillock Basilisk
1House Arn Bannerman
1Hunting Party
1King Arthur
1Kingswood Poachers
1Lake Afanc
1Lord of Unland
1Lumbering Giant
1Monstrous Lion
1Petrosian Cavalry
1Pirate Ship
1Pudge Butcher
1Royal Bodyguard
1Ruler of Thul
1Saracen Raiders
1Selfsame Simulacrum
1Siege Giant
1Sir Balin
1Sir Bedivere
1Sir Gaheris
1Sir Gawain
1Sir Ironside
1Sir Kay
1Sir Lamorak
1Sir Morien
1Sir Perceval
1Sir Priamus
1Skirmishers of Mu
1The Faerie Queene
1Wicked Witch
1Witherwing Hero
1Zephyranne Airship
1Amazon Warriors
1Askelon Phoenix
1Atlas Wanderers
1Azuridge Caravan
1Black Knight
1Blunderbore
1Bull Demons of Adum
1Courtesan Thaïs
1Dame Britomart
1Daperyll Vampire
1East-West Dragon
1Hounds of Ondaros
1Monastery Gargoyle
1Panorama Manticore
1Queen of Midland
1Questing Beast
1Rebecks
1Sir Galahad
1Sir Tristan
1Spearmarshal
1Stone-gaze Gorgons
1Vivien the Enchantress
1White Knight
1Ghost Ship
1Grandmaster Wizard
1Infernal Legion
1Mester Stoor Worm
1Mother Nature
1Nimbus Jinn
1Rhitta Gawr of Snowdonia
1Riddle Sphinx
1Seelie Court
1Seirawan Hydra
1Sir Lancelot
1Sir Mordred
1Sir Pellinore
1Sky Baron
1The Green Knight
1The Wild Hunt
1Thundering Giant
1Wyvern
1Adtonitum
1Ancient Dragon
1Death Dealer
1Draco Corvus
1Highland Clansmen
1Ignis Rex
1King of the Realm
1Nightmare
1Talamh Dreig
1Vatn Draconis
1Wraetannis Titan
1Xeraphine Konrul
1Conqueror Worm
1Diluvian Kraken
1Great Old One
1Midland Army
1Mountain Giant
1Ultimate Horror
1Lord of the Void

Magic (66)
1Arcane Barrage
1Browse
1Dream-Quest
1Immolation
1Pendragon Legacy
1Plague of Frogs
1Shrink
1Tithe
1Backstab
1Blink
1Chain Lightning
1Common Sense
1Degradation
1Disenchant
1Dispel
1Firebolts
1Geyser
1Lightning Bolt
1Magic Missiles
1Mortality
1Pollimorph
1Power of Flight
1Recall
1Riptide
1Blaze
1Border Militia
1Burning Hands
1Bury
1Disintegrate
1Drown
1Duel
1Flanking Maneuver
1Grapple Shot
1Heat Ray
1Ice Lance
1Minor Explosion
1Rescue
1Vanishment
1Warp Spasm
1Arc Lightning
1Cave-In
1Chaos Twister
1Firebreathing
1Gigantism
1Infiltrate
1Leap Attack
1Mesmerism
1Pact with the Devil
1Raise Dead
1Shapeshift
1Shatter Strike
1Stone Rain
1Stormy Seas
1Ball Lightning
1Earthquake
1Incinerate
1Lava Flow
1Poison Nova
1Whirling Blades
1Cone of Flame
1Flame Wave
1Guards!
1Major Explosion
1Wrath of the Sea
1Craterize
1Meteor Shower

Site (48)
2Aqueduct
1Arid Desert
1Babbling Brook
1Beacon
1Bedrock
1Briar Patch
2Caerleon-Upon-Usk
1Common Village
1Dark Tower
1Fields of Camlann
1Floodplain
2Glastonbury Tor
1Gothic Tower
1Humble Village
2Joyous Garde
1Kelp Cavern
2Lighthouse
1Lone Tower
1Lookout
1Mirror Realm
2Oasis
1Pillar of Zeiros
1Pond
1Red Desert
1Remote Desert
1Rift Valley
1River of Flame
1Roots of Yggdrasil
2Ruins
2Sinkhole
2Steppe
1Tadpole Pool
2Tintagel
1Treetop Hideout
1Troll Bridge
1Vesuvius
2Windmill

Sideboard (15)
1Archimago
1Avatar of Air
1Avatar of Earth
1Avatar of Water
1Battlemage
1Dragonlord
1Druid
1Elementalist
1Flamecaller
1Geomancer
1Pathfinder
1Seer
1Sorcerer
1Sparkmage
1Waveshaper
1Adept Illusionist
1Brother Knight

`;

// ---- Parser for Curiosa-style deck text (ported from src/lib/decks/parsers/sorcery-decktext.ts) ----

const CATEGORY_ORDER = [
  "Avatar",
  "Aura",
  "Artifact",
  "Minion",
  "Magic",
  "Site",
  "Sideboard",
];

function normalizeName(raw) {
  return String(raw || "")
    .replace(/[\u00A0\t\r]+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeCategory(raw) {
  const base = normalizeName(raw)
    .toLowerCase()
    .replace(/\s+\(.*\)$/, "");
  const word = (base.split(/\s+/)[0] || base).trim();
  const singular = word.endsWith("s") ? word.slice(0, -1) : word;
  switch (singular) {
    case "avatar":
      return "Avatar";
    case "aura":
      return "Aura";
    case "artifact":
      return "Artifact";
    case "minion":
      return "Minion";
    case "magic":
    case "spell":
      return "Magic";
    case "site":
      return "Site";
    case "sideboard":
      return "Sideboard";
    default:
      return null;
  }
}

function isCategoryHeader(line) {
  const m = normalizeName(line);
  const header = m.replace(/\s*\(\d+\)\s*$/, "");
  return canonicalizeCategory(header);
}

function isOnlyDigits(line) {
  return /^\d+$/.test(String(line || "").trim());
}

function parseCountAndName(line) {
  const m = String(line || "").match(/^(\d+)\s*(.+)$/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  const name = normalizeName(m[2]);
  if (!name) return null;
  return { count, name };
}

/**
 * Parse Curiosa-style deck text into categorized name/count lists.
 */
function parseSorceryDeckText(rawInput) {
  const text = String(rawInput || "").replace(/[\r]+/g, "\n");
  const lines = text
    .split(/\n+/)
    .map((x) => x.replace(/\u00A0/g, " ").trim())
    .filter((x) => x.length > 0);

  const categories = {
    Avatar: new Map(),
    Aura: new Map(),
    Artifact: new Map(),
    Minion: new Map(),
    Magic: new Map(),
    Site: new Map(),
    Sideboard: new Map(),
  };

  const issues = [];
  let current = null;

  for (const rawLine of lines) {
    const line = normalizeName(rawLine);

    if (/^deck history$/i.test(line)) break;
    if (isOnlyDigits(line)) continue;

    const cat = isCategoryHeader(line);
    if (cat) {
      current = cat;
      continue;
    }

    const parsed = parseCountAndName(line);
    if (parsed) {
      if (!current) {
        current = "Magic";
        issues.push({
          type: "warning",
          message: `No category header before line: "${line}". Defaulted to Magic.`,
        });
      }
      const map = categories[current];
      const key = normalizeName(parsed.name);
      map.set(key, (map.get(key) || 0) + parsed.count);
      continue;
    }

    issues.push({
      type: "warning",
      message: `Unrecognized line ignored: "${line}"`,
    });
  }

  const resultLists = {
    Avatar: [],
    Aura: [],
    Artifact: [],
    Minion: [],
    Magic: [],
    Site: [],
    Sideboard: [],
  };
  const totalByCategory = {
    Avatar: 0,
    Aura: 0,
    Artifact: 0,
    Minion: 0,
    Magic: 0,
    Site: 0,
    Sideboard: 0,
  };

  for (const cat of CATEGORY_ORDER) {
    const items = Array.from(categories[cat].entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    resultLists[cat] = items;
    totalByCategory[cat] = items.reduce((a, b) => a + b.count, 0);
  }

  const totalCards = CATEGORY_ORDER.reduce(
    (sum, c) => sum + totalByCategory[c],
    0
  );

  if (totalByCategory.Avatar !== 1) {
    issues.push({
      type: "warning",
      message: `Expected exactly 1 Avatar, found ${totalByCategory.Avatar}`,
    });
  }

  return { categories: resultLists, totalByCategory, totalCards, issues };
}

// ---- Name canonicalization and batch variant lookup (ported from cube text import API) ----

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
      (c) => canonicalize(c.name) === canon || c.name === name
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
          }))
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

// ---- Cube seeding logic ----

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
      `[CubeSeed] Created system user ${systemUser.id} (${SYSTEM_EMAIL})`
    );
  }
  const userId = systemUser.id;

  console.log(
    `[CubeSeed] Seeding cube '${CUBE_NAME}' owned by '${SYSTEM_NAME}' (public).`
  );

  const parsed = parseSorceryDeckText(CUBE_TEXT);

  const mainCategories = CATEGORY_ORDER.filter((c) => c !== "Sideboard");
  const mainAggregated = new Map();
  const sideboardAggregated = new Map();

  for (const cat of mainCategories) {
    for (const entry of parsed.categories[cat]) {
      const key = entry.name;
      const prev = mainAggregated.get(key) || 0;
      mainAggregated.set(key, prev + entry.count);
    }
  }

  for (const entry of parsed.categories.Sideboard) {
    const key = entry.name;
    const prev = sideboardAggregated.get(key) || 0;
    sideboardAggregated.set(key, prev + entry.count);
  }

  const uniqueNames = Array.from(
    new Set([
      ...Array.from(mainAggregated.keys()),
      ...Array.from(sideboardAggregated.keys()),
    ])
  );
  console.log(
    `[CubeSeed] Unique card names in cube text: ${uniqueNames.length}`
  );

  const nameToVariant = await batchFindVariants(uniqueNames, [
    "Arthurian Legends",
    "Beta",
    "Alpha",
    "Dragonlord",
  ]);

  /** @type {Array<{ cardId: number, setId: number | null, variantId: number | null, count: number, name: string, zone: "main" | "sideboard" }>} */
  const cardRows = [];
  const unresolved = [];

  for (const [name, count] of mainAggregated.entries()) {
    const found = nameToVariant.get(name);
    if (!found) {
      unresolved.push({ name, count });
      continue;
    }
    cardRows.push({
      cardId: found.cardId,
      setId: found.setId,
      variantId: found.variantId,
      count,
      name,
      zone: "main",
    });
  }

  for (const [name, count] of sideboardAggregated.entries()) {
    const found = nameToVariant.get(name);
    if (!found) {
      unresolved.push({ name, count });
      continue;
    }
    cardRows.push({
      cardId: found.cardId,
      setId: found.setId,
      variantId: found.variantId,
      count,
      name,
      zone: "sideboard",
    });
  }

  if (unresolved.length) {
    console.error(
      "[CubeSeed] ERROR: Could not resolve some cards by name. Aborting."
    );
    for (const u of unresolved) {
      console.error(`  - ${u.name} (count ${u.count})`);
    }
    throw new Error(`Failed to resolve ${unresolved.length} card name(s).`);
  }

  const totalCards = cardRows.reduce((sum, r) => sum + r.count, 0);
  console.log(
    `[CubeSeed] Resolved ${cardRows.length} unique cards (${totalCards} total copies).`
  );

  let cube = await prisma.cube.findFirst({
    where: { userId, name: CUBE_NAME },
  });
  if (!cube) {
    cube = await prisma.cube.create({
      data: {
        userId,
        name: CUBE_NAME,
        description: CUBE_DESCRIPTION,
        isPublic: true,
        imported: true,
      },
    });
    console.log(`[CubeSeed] Created cube ${CUBE_NAME} (${cube.id})`);
  } else {
    cube = await prisma.cube.update({
      where: { id: cube.id },
      data: {
        description: CUBE_DESCRIPTION,
        isPublic: true,
        imported: true,
      },
    });
    console.log(`[CubeSeed] Updating existing cube ${CUBE_NAME} (${cube.id})`);
  }

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
    `[CubeSeed] Upserted cube '${CUBE_NAME}' with ${cardRows.length} unique entries (${totalCards} total cards).`
  );
}

main()
  .catch((err) => {
    console.error("[CubeSeed] Failed:", err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

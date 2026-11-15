/*
  Ingest Sorcery: Contested Realm cards from the public API into Prisma DB.
  - Fetches https://api.sorcerytcg.com/api/cards
  - Normalizes Sets, Cards, CardSetMetadata, Variants

  Slugs from the API are NOT stable: the set renumbering rewrote every one of
  them (alp-detonate-b-s -> 001-detonate-b-s), which breaks every resolver keyed
  on the 3-letter set prefix. Incoming slugs are therefore canonicalized back to
  our form via sorcery-registry, and the registry's permanent ids are stamped
  onto Card.codexId / Variant.printingId so future renames cost nothing.

  The API changed shape (2026-11): cards now carry a card-level `engine` block
  and a flat `printings` list instead of `guardian` / `sets[].variants[]`.
  `normalizeApiCard` maps the new shape back onto the legacy one, because
  data/cards_raw.json is a RUNTIME source (server rules, bots) that expects it.

  Usage:
    node scripts/ingest-cards.js                  # fetch from the live API
    node scripts/ingest-cards.js --from-file data/cards_raw.json
                                                  # re-ingest a snapshot offline
    node scripts/ingest-cards.js --merge-set 008  # add ONE set's printings to
                                                  # data/cards_raw.json, no DB
                                                  # writes (then run
                                                  # upsert-new-cards.js --set)
*/
// Load .env for local development
try {
  require("dotenv").config();
} catch {}
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/** Map API rarity string to Prisma enum */
function mapRarity(r) {
  if (!r) return null; // Promo cards may not have rarity
  const v = String(r).trim();
  if (["Ordinary", "Exceptional", "Elite", "Unique"].includes(v)) return v;
  console.warn(`Unknown rarity "${r}", treating as null`);
  return null;
}

/** Map API finish string to Prisma enum */
function mapFinish(f) {
  if (!f) return null;
  const v = String(f).trim();
  if (v === "Standard" || v === "Foil" || v === "Rainbow") return v;
  throw new Error(`Unknown finish: ${f}`);
}

/** Map API product string to Prisma enum */
// No mapping now; we will persist the product string as provided by the API
function normalizeProduct(p) {
  if (!p) return null;
  return String(p).trim();
}

// --- New API shape -> legacy cards_raw.json shape ---

/** Numeric set code -> our 3-letter slug prefix (mirrors registry/sync-registry.js) */
const SET_CODE_PREFIXES = {
  "001": "alp",
  "002": "bet",
  "004": "art",
  "005": "dra",
  "006": "got",
  "008": "fvl",
  "999": "pro",
};

/** The API renamed "Promotional" to "Promo"; the DB Set rows keep the old name */
const SET_NAME_OVERRIDES = { Promo: "Promotional" };

/** Legacy element strings list elements in this order: "Earth, Fire, Water, Air" */
const ELEMENT_ORDER = ["Earth", "Fire", "Water", "Air"];

function legacyElements(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const real = ELEMENT_ORDER.filter((e) => list.includes(e));
  return real.length ? real.join(", ") : "None";
}

/** "PreconstructedDeck" -> "Preconstructed_Deck" (the stored product strings) */
function legacyProduct(product) {
  if (!product) return null;
  return String(product).replace(/([a-z])([A-Z])/g, "$1_$2");
}

/** `008-frost_mage-pd-s` -> `fvl-frost_mage-pd-s`; unknown codes pass through */
function legacySlug(slug) {
  const m = String(slug).match(/^(\d{3})-(.+)$/);
  if (!m || !SET_CODE_PREFIXES[m[1]]) return slug;
  return `${SET_CODE_PREFIXES[m[1]]}-${m[2]}`;
}

/**
 * Rules text the API can't express: Fireball (FvL) prints its damage pattern as
 * a diagram, so the API text ends at "affected locations." with no numbers.
 */
const PRINTED_DIAGRAM_TEXT = {
  "Shoot a projectile. It explodes on impact, dealing damage to each unit at affected locations.":
    "Shoot a projectile. It explodes on impact, dealing damage to each unit at affected locations: 4 at the location it hits, and 2 at each location orthogonally adjacent to it.",
};

function legacyMetadata(engine) {
  const rules = engine.rules || "";
  return {
    rarity: engine.rarity ?? null,
    type: engine.type || "",
    rulesText: PRINTED_DIAGRAM_TEXT[rules.trim()] || rules,
    cost: engine.cost ?? null,
    attack: engine.attack ?? null,
    // FvL cards arrive with `defense: null`; units with one printed power
    // stat store it as both attack and defence (split-stat units carry both)
    defence:
      engine.defense ??
      (["Minion", "Avatar"].includes(engine.type) ? engine.attack ?? null : null),
    life: engine.life ?? null,
    thresholds: {
      air: engine.air || 0,
      earth: engine.earth || 0,
      fire: engine.fire || 0,
      water: engine.water || 0,
    },
  };
}

/** Is this card in the new `engine` + `printings` API shape? */
function isApiShape(card) {
  return Boolean(card && card.engine && Array.isArray(card.printings));
}

/**
 * Map a new-shape API card onto the legacy shape. Per-set metadata is the
 * card-level engine block (the new API no longer carries per-set rules text).
 * Sets are ordered by their first printing date, oldest first, like before.
 */
function normalizeApiCard(card) {
  if (!isApiShape(card)) return card;
  const engine = card.engine;
  const meta = legacyMetadata(engine);
  const sets = new Map();
  for (const p of card.printings) {
    const apiSet = p.set || {};
    const setName = SET_NAME_OVERRIDES[apiSet.name] || apiSet.name;
    if (!setName) continue;
    if (!sets.has(setName)) {
      sets.set(setName, {
        name: setName,
        code: apiSet.code || null,
        releasedAt: p.printedAt || apiSet.releasedAt || null,
        metadata: meta,
        variants: [],
      });
    }
    const entry = sets.get(setName);
    if (p.printedAt && (!entry.releasedAt || p.printedAt < entry.releasedAt)) {
      entry.releasedAt = p.printedAt;
    }
    const m = p.meta || {};
    entry.variants.push({
      slug: legacySlug(p.slug),
      finish: m.finish || null,
      product: legacyProduct(m.product),
      artist: (m.artist && m.artist.name) || "",
      flavorText: m.flavor || "",
      typeText: m.typeline || "",
    });
  }
  const orderedSets = [...sets.values()]
    .sort((a, b) => String(a.releasedAt).localeCompare(String(b.releasedAt)))
    .map(({ code: _code, ...rest }) => rest);
  return {
    name: card.name,
    guardian: meta,
    elements: legacyElements(engine.elements),
    subTypes: [...(engine.subtypes || [])].sort().join(", "),
    sets: orderedSets,
  };
}

/**
 * Merge one set's printings from the API into the local snapshot without
 * touching any other card. New cards are appended whole. A reprint supersedes
 * the older printings: its card-level `guardian` and every older set's
 * metadata take the reprint's data (FvL rebalanced Polar Bears to 3 cost 3
 * power and rewrote Fireball), while each set keeps its own variants.
 */
function mergeSetIntoSnapshot(apiCards, setKey) {
  const rawPath = path.join(process.cwd(), "data", "cards_raw.json");
  const snapshot = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const byName = new Map(snapshot.map((c) => [c.name, c]));
  const key = String(setKey).trim().toLowerCase();
  const inSet = (p) =>
    String(p.set?.code || "").toLowerCase() === key ||
    String(p.set?.name || "").toLowerCase() === key;

  const added = [];
  const reprinted = [];
  const superseded = [];
  let setName = null;
  for (const apiCard of apiCards) {
    if (!isApiShape(apiCard)) {
      throw new Error("--merge-set needs the new API shape (engine + printings)");
    }
    const printings = apiCard.printings.filter(inSet);
    if (!printings.length) continue;
    const normalized = normalizeApiCard({ ...apiCard, printings });
    const setEntry = normalized.sets[0];
    setName = setEntry.name;
    const existing = byName.get(apiCard.name);
    if (existing) {
      const flat = (t) => String(t || "").replace(/\s+/g, " ").trim();
      const before = existing.guardian || {};
      const after = setEntry.metadata;
      const changed = Object.keys(after).filter((k) =>
        k === "rulesText"
          ? flat(before[k]) !== flat(after[k])
          : JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
      );
      existing.guardian = { ...after };
      existing.elements = normalized.elements;
      // The FvL Winter River arrived without its River subtype (the other
      // seasonal Rivers keep it): an empty list never erases a known one
      existing.subTypes = normalized.subTypes || existing.subTypes;
      existing.sets = (existing.sets || [])
        .filter((s) => s.name !== setName)
        .map((s) => ({ ...s, metadata: { ...after } }));
      existing.sets.push(setEntry);
      reprinted.push(apiCard.name);
      if (changed.length) superseded.push(`${apiCard.name} (${changed.join(", ")})`);
    } else {
      snapshot.push(normalized);
      byName.set(apiCard.name, normalized);
      added.push(apiCard.name);
    }
  }
  if (!setName) throw new Error(`No printings found for set "${setKey}"`);

  fs.writeFileSync(rawPath, JSON.stringify(snapshot, null, 2));
  console.log(`Merged set "${setName}" into data/cards_raw.json`);
  console.log(`  New cards (${added.length}): ${added.join(", ")}`);
  console.log(`  Reprints  (${reprinted.length}): ${reprinted.join(", ")}`);
  console.log(
    `  Superseded by the reprint (${superseded.length}): ${superseded.join("; ") || "-"}`,
  );
  console.log("");
  console.log("Next: upsert just this set into the DB (on the prod server):");
  console.log(`  node scripts/upsert-new-cards.js --set "${setName}" --dry-run`);
}

/** Registry lookups: canonical slug + permanent ids for an incoming API slug */
function loadRegistry() {
  const file = path.join(
    __dirname, "..", "data", "registry", "printing-index.json"
  );
  if (!fs.existsSync(file)) {
    console.warn(
      "data/registry/printing-index.json missing - slugs will be stored as the API reports them and no registry ids will be stamped. Run: node scripts/registry/sync-registry.js"
    );
    return null;
  }
  const index = JSON.parse(fs.readFileSync(file, "utf8"));
  const legacyByPrinting = new Map();
  for (const [legacySlug, printingId] of Object.entries(index.byLegacySlug)) {
    legacyByPrinting.set(printingId, legacySlug);
  }
  return { index, legacyByPrinting };
}

/**
 * Map an API slug onto the slug we store plus its registry ids. Falls through
 * unchanged for printings the registry doesn't know, so ingest never drops a card.
 */
function canonicalize(registry, apiSlug) {
  if (!registry) return { slug: apiSlug, printingId: null, codexId: null };
  const key = String(apiSlug).trim().toLowerCase();
  const printingId =
    registry.index.bySlug[key] || registry.index.byLegacySlug[key] || null;
  if (!printingId) return { slug: apiSlug, printingId: null, codexId: null };
  return {
    slug: registry.legacyByPrinting.get(printingId) || apiSlug,
    printingId,
    codexId: registry.index.codexByPrinting[printingId] || null,
  };
}

/** Compute an image basename from a variant slug by stripping set prefix (e.g., alp_, bet_, arl_) */
function computeImageBasename(slug) {
  if (!slug) return null;
  const s = String(slug);
  // Remove a 3-letter prefix + underscore if present (e.g., alp_, bet_, arl_, drl_)
  const m = s.match(/^[a-z]{3}_(.+)$/);
  const core = m ? m[1] : s;
  return core; // Usually like apprentice_wizard_b_s or *_b_f
}

async function main() {
  const fileArg = process.argv.indexOf("--from-file");
  const fromFile = fileArg !== -1 ? process.argv[fileArg + 1] : null;
  const mergeArg = process.argv.indexOf("--merge-set");
  const mergeSet = mergeArg !== -1 ? process.argv[mergeArg + 1] : null;
  if (mergeArg !== -1 && !mergeSet) {
    throw new Error("--merge-set needs a set code or name, e.g. --merge-set 008");
  }

  let cards;
  if (fromFile) {
    console.log(`Reading cards from ${fromFile}...`);
    cards = JSON.parse(fs.readFileSync(fromFile, "utf8"));
    if (!Array.isArray(cards)) {
      throw new Error("Unexpected snapshot: expected an array");
    }
    console.log(`Loaded ${cards.length} cards (no API call, snapshot untouched).`);
  } else {
    console.log("Fetching cards from API...");
    const res = await axios.get("https://api.sorcerytcg.com/api/cards", {
      timeout: 60000,
    });
    if (!Array.isArray(res.data)) {
      throw new Error("Unexpected response: expected an array");
    }
    cards = res.data;
    console.log(`Received ${cards.length} cards.`);
  }

  if (mergeSet) {
    mergeSetIntoSnapshot(cards, mergeSet);
    return;
  }

  // Everything below (snapshot + DB) works on the legacy shape
  cards = cards.map(normalizeApiCard);

  const registry = loadRegistry();
  let stampedVariants = 0;

  // Save a raw snapshot for reference (never when we just read one)
  if (!fromFile) try {
    const dataDir = path.join(process.cwd(), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "cards_raw.json"),
      JSON.stringify(cards, null, 2)
    );
    console.log("Saved raw snapshot to data/cards_raw.json");
  } catch (e) {
    console.warn(
      "Warning: could not write data/cards_raw.json:",
      e?.message || e
    );
  }

  let createdCards = 0,
    updatedCards = 0,
    createdSets = 0,
    createdVariants = 0;

  for (const card of cards) {
    const { name, elements, subTypes, sets } = card;
    if (!name) continue;

    // Upsert Card by name
    let dbCard = await prisma.card.findFirst({ where: { name } });
    if (!dbCard) {
      dbCard = await prisma.card.create({
        data: { name, elements: elements || null, subTypes: subTypes || null },
      });
      createdCards++;
    } else {
      // update basic fields if changed
      if (dbCard.elements !== elements || dbCard.subTypes !== subTypes) {
        dbCard = await prisma.card.update({
          where: { id: dbCard.id },
          data: { elements: elements || null, subTypes: subTypes || null },
        });
        updatedCards++;
      }
    }

    if (Array.isArray(sets)) {
      for (const s of sets) {
        const setName = s.name;
        const releasedAt = s.releasedAt ? new Date(s.releasedAt) : null;
        let dbSet = await prisma.set.findUnique({ where: { name: setName } });
        if (!dbSet) {
          dbSet = await prisma.set.create({
            data: { name: setName, releasedAt },
          });
          createdSets++;
        }

        const meta = s.metadata || {};
        // Upsert CardSetMetadata by (cardId, setId)
        await prisma.cardSetMetadata.upsert({
          where: { cardId_setId: { cardId: dbCard.id, setId: dbSet.id } },
          create: {
            card: { connect: { id: dbCard.id } },
            set: { connect: { id: dbSet.id } },
            rarity: mapRarity(meta.rarity),
            type: meta.type || "",
            rulesText: meta.rulesText || null,
            cost: meta.cost ?? null,
            attack: meta.attack ?? null,
            defence: meta.defence ?? null,
            life: meta.life ?? null,
            thresholds: meta.thresholds ? meta.thresholds : null,
          },
          update: {
            rarity: mapRarity(meta.rarity),
            type: meta.type || "",
            rulesText: meta.rulesText || null,
            cost: meta.cost ?? null,
            attack: meta.attack ?? null,
            defence: meta.defence ?? null,
            life: meta.life ?? null,
            thresholds: meta.thresholds ? meta.thresholds : null,
          },
        });

        // Variants
        if (Array.isArray(s.variants)) {
          for (const v of s.variants) {
            if (!v.slug) continue;
            // Store our canonical slug, not whatever the API currently reports
            const { slug, printingId, codexId } = canonicalize(registry, v.slug);

            if (codexId && dbCard.codexId !== codexId) {
              dbCard = await prisma.card.update({
                where: { id: dbCard.id },
                data: { codexId },
              });
            }

            const existing = await prisma.variant.findUnique({
              where: { slug },
            });
            if (existing) {
              // Backfill ids onto rows ingested before the registry existed
              if (printingId && existing.printingId !== printingId) {
                await prisma.variant.update({
                  where: { id: existing.id },
                  data: { printingId },
                });
                stampedVariants++;
              }
              continue;
            }

            await prisma.variant.create({
              data: {
                card: { connect: { id: dbCard.id } },
                set: { connect: { id: dbSet.id } },
                slug,
                printingId,
                finish: mapFinish(v.finish),
                product: normalizeProduct(v.product),
                artist: v.artist || null,
                flavorText: v.flavorText || null,
                typeText: v.typeText || null,
                imageBasename: computeImageBasename(slug),
              },
            });
            createdVariants++;
          }
        }
      }
    }
  }

  console.log(
    `Done. Cards created: ${createdCards}, updated: ${updatedCards}; Sets created: ${createdSets}; Variants created: ${createdVariants}; registry ids stamped on existing variants: ${stampedVariants}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

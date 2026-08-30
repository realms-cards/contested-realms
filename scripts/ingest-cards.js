/*
  Ingest Sorcery: Contested Realm cards from the public API into Prisma DB.
  - Fetches https://api.sorcerytcg.com/api/cards
  - Normalizes Sets, Cards, CardSetMetadata, Variants

  Slugs from the API are NOT stable: the set renumbering rewrote every one of
  them (alp-detonate-b-s -> 001-detonate-b-s), which breaks every resolver keyed
  on the 3-letter set prefix. Incoming slugs are therefore canonicalized back to
  our form via sorcery-registry, and the registry's permanent ids are stamped
  onto Card.codexId / Variant.printingId so future renames cost nothing.

  Usage:
    node scripts/ingest-cards.js                  # fetch from the live API
    node scripts/ingest-cards.js --from-file data/cards_raw.json
                                                  # re-ingest a snapshot offline
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

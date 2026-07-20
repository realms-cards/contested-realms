/*
  Targeted upsert of newly released cards into the Prisma DB.

  Unlike `ingest:cards` (which re-fetches and re-writes the ENTIRE catalog from
  the API), this script only touches an explicit allow-list of card names, read
  from the local `data/cards_raw.json` snapshot. Use it to add a small cycle of
  new cards without risking the rest of the catalog — notably while the upstream
  API is serving the new numeric slug prefixes (999-/001-) that the rest of the
  pipeline does not yet understand.

  It is idempotent: Cards/Sets/CardSetMetadata/Variants are all upserted, so
  re-running corrects data rather than duplicating it.

  Usage (run on the PROD server, where DATABASE_URL points at prod):
    node scripts/upsert-new-cards.js            # upsert the default NEW_CARD_NAMES
    node scripts/upsert-new-cards.js --dry-run  # report what would change, write nothing
    node scripts/upsert-new-cards.js --names "Mock Court,Court of Equity"
*/
// Load .env for local development
try {
  require("dotenv").config();
} catch {}
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// --- The cards this run is allowed to touch ---
const DEFAULT_NEW_CARD_NAMES = [
  "Overflowing Court",
  "Court of Equity",
  "Mobbed Court",
  "Mock Court",
];

// --- CLI args ---
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
function argValue(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}
const namesArg = argValue("--names");
const NEW_CARD_NAMES = namesArg
  ? namesArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_NEW_CARD_NAMES;

// --- Enum mapping (mirrors scripts/ingest-cards.js) ---
function mapRarity(r) {
  if (!r) return null;
  const v = String(r).trim();
  if (["Ordinary", "Exceptional", "Elite", "Unique"].includes(v)) return v;
  console.warn(`Unknown rarity "${r}", treating as null`);
  return null;
}
function mapFinish(f) {
  if (!f) return null;
  const v = String(f).trim();
  if (v === "Standard" || v === "Foil" || v === "Rainbow") return v;
  throw new Error(`Unknown finish: ${f}`);
}
function normalizeProduct(p) {
  if (!p) return null;
  return String(p).trim();
}

/**
 * Compute the image basename used by the CDN/webp/ktx2 assets from a variant
 * slug. Handles both separator styles ("pro-mock_court-d-s" and
 * "pro_mock_court_d_s") by normalizing to underscores, then stripping the
 * 3-letter set prefix. Result e.g. "mock_court_d_s" — matches the produced
 * data-webp/promo/mock_court_d_s.webp filenames and src/lib/utils/cdnUrl.ts.
 */
function computeImageBasename(slug) {
  if (!slug) return null;
  let s = String(slug).toLowerCase();
  s = s.replace(/^([a-z]{3})-/, "$1_"); // set prefix separator: pro-  -> pro_
  s = s.replace(/-([a-z]{1,2})-([a-z])$/, "_$1_$2"); // finish/variant: -d-s -> _d_s
  s = s.replace(/-/g, "_"); // any remaining dashes
  const m = s.match(/^[a-z]{3}_(.+)$/);
  return m ? m[1] : s;
}

async function main() {
  console.log("=== Upsert New Cards ===");
  console.log(`Mode:  ${DRY_RUN ? "DRY RUN (no writes)" : "WRITE"}`);
  console.log(`Cards: ${NEW_CARD_NAMES.join(", ")}`);
  try {
    const u = new URL(process.env.DATABASE_URL || "");
    console.log(`DB:    ${u.hostname}${u.pathname}`);
  } catch {
    console.log("DB:    (DATABASE_URL not parseable)");
  }
  console.log("");

  const rawPath = path.join(process.cwd(), "data", "cards_raw.json");
  const cards = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
  const wanted = new Set(NEW_CARD_NAMES);
  const selected = cards.filter((c) => wanted.has(c.name));

  const missing = [...wanted].filter(
    (n) => !selected.some((c) => c.name === n),
  );
  if (missing.length) {
    console.error(
      `ERROR: not found in data/cards_raw.json: ${missing.join(", ")}`,
    );
    console.error("Add them to the snapshot first, then re-run.");
    process.exitCode = 1;
    return;
  }

  const stats = {
    cards: 0,
    sets: 0,
    meta: 0,
    variants: 0,
  };

  for (const card of selected) {
    const { name, elements, subTypes, sets } = card;
    console.log(`• ${name}`);

    if (!DRY_RUN) {
      const existing = await prisma.card.findFirst({ where: { name } });
      if (existing) {
        await prisma.card.update({
          where: { id: existing.id },
          data: { elements: elements || null, subTypes: subTypes || null },
        });
      } else {
        await prisma.card.create({
          data: { name, elements: elements || null, subTypes: subTypes || null },
        });
      }
    }
    stats.cards++;

    const dbCard = DRY_RUN
      ? { id: -1 }
      : await prisma.card.findFirst({ where: { name } });

    for (const s of sets || []) {
      const setName = s.name;
      const releasedAt = s.releasedAt ? new Date(s.releasedAt) : null;
      console.log(`    set: ${setName}`);

      let dbSet = DRY_RUN
        ? { id: -1 }
        : await prisma.set.findUnique({ where: { name: setName } });
      if (!DRY_RUN && !dbSet) {
        dbSet = await prisma.set.create({
          data: { name: setName, releasedAt },
        });
        stats.sets++;
        console.log(`      (created set ${setName})`);
      }

      const meta = s.metadata || {};
      if (!DRY_RUN) {
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
      }
      stats.meta++;

      for (const v of s.variants || []) {
        const slug = v.slug;
        if (!slug) continue;
        const imageBasename = computeImageBasename(slug);
        console.log(
          `      variant: ${slug}  (imageBasename: ${imageBasename})`,
        );
        if (!DRY_RUN) {
          await prisma.variant.upsert({
            where: { slug },
            create: {
              card: { connect: { id: dbCard.id } },
              set: { connect: { id: dbSet.id } },
              slug,
              finish: mapFinish(v.finish),
              product: normalizeProduct(v.product),
              artist: v.artist || null,
              flavorText: v.flavorText || null,
              typeText: v.typeText || null,
              imageBasename,
            },
            update: {
              finish: mapFinish(v.finish),
              product: normalizeProduct(v.product),
              artist: v.artist || null,
              flavorText: v.flavorText || null,
              typeText: v.typeText || null,
              imageBasename,
            },
          });
        }
        stats.variants++;
      }
    }
  }

  console.log("");
  console.log(
    `Done${DRY_RUN ? " (dry run)" : ""}. Cards: ${stats.cards}, Sets created: ${stats.sets}, Metadata: ${stats.meta}, Variants: ${stats.variants}`,
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

/*
  Ingest Sorcery: Contested Realm cards from the public API into Prisma DB.
  - Fetches https://api.sorcerytcg.com/api/cards
  - Normalizes Sets, Cards, CardSetMetadata, Variants
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
  if (!r) return null;
  const v = String(r).trim();
  if (["Ordinary", "Exceptional", "Elite", "Unique"].includes(v)) return v;
  throw new Error(`Unknown rarity: ${r}`);
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
  console.log("Fetching cards from API...");
  const res = await axios.get("https://api.sorcerytcg.com/api/cards", {
    timeout: 60000,
  });
  if (!Array.isArray(res.data)) {
    throw new Error("Unexpected response: expected an array");
  }
  const cards = res.data;
  console.log(`Received ${cards.length} cards.`);

  // Save a raw snapshot for reference
  try {
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
            const slug = v.slug;
            if (!slug) continue;
            const existing = await prisma.variant.findUnique({
              where: { slug },
            });
            if (existing) continue;

            await prisma.variant.create({
              data: {
                card: { connect: { id: dbCard.id } },
                set: { connect: { id: dbSet.id } },
                slug,
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
    `Done. Cards created: ${createdCards}, updated: ${updatedCards}; Sets created: ${createdSets}; Variants created: ${createdVariants}`
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

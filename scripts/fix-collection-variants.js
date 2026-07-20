#!/usr/bin/env node
/*
  Backfill CollectionCard rows whose variantId (and often setId) is null.

  Such rows render a placeholder cardback + ⚠️ badge because the collection UI
  resolves images from the variant slug. Rows end up null-linked when a re-ingest
  recreates Variant rows (the CollectionCard.variant relation defaults to
  onDelete: SetNull) or when a card was added without variant resolution
  (e.g. some Curiosa imports).

  This repairs each null row by linking it to a real variant of the same card,
  chosen to match the server-side read-time fallback in
  src/app/api/collection/route.ts (pickFallbackVariant):
    same set + finish  ->  Booster printing + finish  ->  any matching finish
    ->  any Booster printing  ->  first available variant.
  Booster printings are preferred because they carry the real card art on the
  CDN (promo / box-topper / dust printings frequently do not).

  It is idempotent (only touches variantId: null rows) and safe to re-run.
  Because CollectionCard has @@unique([userId, cardId, variantId, finish]), a
  plain update can collide with an existing row for the same card+finish; in
  that case this merges quantities/notes into the existing row and deletes the
  null duplicate instead of throwing.

  Usage (run on the PROD server, where DATABASE_URL points at prod):
    node scripts/fix-collection-variants.js               # DRY RUN: report only, write nothing
    node scripts/fix-collection-variants.js --apply       # perform the backfill
    node scripts/fix-collection-variants.js --apply --delete-unfixable
                                                          # also delete rows whose card has no variants
*/
// Load .env for local development
try {
  require("dotenv").config();
} catch {}
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const DELETE_UNFIXABLE = argv.includes("--delete-unfixable");
const DRY_RUN = !APPLY;

/**
 * Pick the best variant to represent a null-linked collection row.
 * Mirrors pickFallbackVariant in src/app/api/collection/route.ts.
 */
function pickFallbackVariant(variants, setId, finish) {
  if (!variants || variants.length === 0) return null;
  if (setId != null) {
    const sameSetAndFinish = variants.find(
      (v) => v.setId === setId && v.finish === finish
    );
    if (sameSetAndFinish) return sameSetAndFinish;
    const sameSet = variants.find((v) => v.setId === setId);
    if (sameSet) return sameSet;
  }
  const boosterFinish = variants.find(
    (v) => v.product === "Booster" && v.finish === finish
  );
  if (boosterFinish) return boosterFinish;
  const anyFinish = variants.find((v) => v.finish === finish);
  if (anyFinish) return anyFinish;
  const booster = variants.find((v) => v.product === "Booster");
  if (booster) return booster;
  return variants[0];
}

async function main() {
  console.log(
    DRY_RUN
      ? "DRY RUN — reporting only, no writes. Re-run with --apply to execute.\n"
      : "APPLY — writing changes to the database.\n"
  );

  const rows = await prisma.collectionCard.findMany({
    where: { variantId: null },
    include: {
      card: {
        include: {
          variants: {
            select: {
              id: true,
              slug: true,
              finish: true,
              setId: true,
              product: true,
              set: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  console.log(`Found ${rows.length} collection rows with variantId = null.\n`);
  if (rows.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  let updated = 0;
  let merged = 0;
  let deletedUnfixable = 0;
  let unfixable = 0;
  const unfixableByCard = new Map();

  for (const cc of rows) {
    const card = cc.card;
    const variant = pickFallbackVariant(
      card.variants,
      cc.setId,
      cc.finish
    );

    if (!variant) {
      unfixable++;
      unfixableByCard.set(card.name, (unfixableByCard.get(card.name) || 0) + 1);
      if (DELETE_UNFIXABLE && APPLY) {
        await prisma.collectionCard.delete({ where: { id: cc.id } });
        deletedUnfixable++;
      }
      continue;
    }

    // Would assigning this variant collide with an existing row?
    // (unique: userId, cardId, variantId, finish)
    const collision = await prisma.collectionCard.findUnique({
      where: {
        userId_cardId_variantId_finish: {
          userId: cc.userId,
          cardId: cc.cardId,
          variantId: variant.id,
          finish: cc.finish,
        },
      },
      select: { id: true, quantity: true, notes: true },
    });

    if (collision) {
      // Merge the orphaned row into the existing linked row, then drop it.
      const newQuantity = Math.min(99, collision.quantity + cc.quantity);
      const newNotes =
        collision.notes && cc.notes
          ? `${collision.notes}; ${cc.notes}`
          : collision.notes || cc.notes || null;
      console.log(
        `  ~ ${card.name} [${cc.finish}] → merge into existing (${variant.slug}), qty ${collision.quantity}+${cc.quantity}=${newQuantity}`
      );
      if (APPLY) {
        await prisma.$transaction([
          prisma.collectionCard.update({
            where: { id: collision.id },
            data: { quantity: newQuantity, notes: newNotes },
          }),
          prisma.collectionCard.delete({ where: { id: cc.id } }),
        ]);
      }
      merged++;
    } else {
      console.log(
        `  ✓ ${card.name} [${cc.finish}] → ${variant.slug} (${variant.set?.name || "unknown set"})`
      );
      if (APPLY) {
        await prisma.collectionCard.update({
          where: { id: cc.id },
          data: { variantId: variant.id, setId: variant.setId },
        });
      }
      updated++;
    }
  }

  console.log("\n--- Summary ---");
  console.log(`${DRY_RUN ? "Would link" : "Linked"}: ${updated}`);
  console.log(`${DRY_RUN ? "Would merge" : "Merged"} (dedup): ${merged}`);
  console.log(`Unfixable (card has no variants): ${unfixable}`);
  if (unfixable > 0) {
    for (const [name, count] of [...unfixableByCard.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`    - ${name} × ${count}`);
    }
    if (DELETE_UNFIXABLE) {
      console.log(
        `${DRY_RUN ? "Would delete" : "Deleted"} unfixable: ${DRY_RUN ? unfixable : deletedUnfixable}`
      );
    } else {
      console.log(
        "  (re-run with --apply --delete-unfixable to remove these, or leave them as placeholders)"
      );
    }
  }
  if (DRY_RUN) {
    console.log("\nNo changes written. Re-run with --apply to execute.");
  }
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

#!/usr/bin/env node
/**
 * Fix collection cards that are missing variantId/setId
 * This resolves images not loading for Curiosa-imported cards
 *
 * Usage: node scripts/fix-collection-variants.js [--delete]
 *   --delete: Delete cards that can't be fixed instead of fixing them
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const deleteMode = process.argv.includes("--delete");

  console.log("Finding collection cards without variants...");

  // Find all collection cards missing variantId
  const cardsWithoutVariant = await prisma.collectionCard.findMany({
    where: {
      variantId: null,
    },
    include: {
      card: {
        include: {
          variants: {
            include: {
              set: true,
            },
          },
        },
      },
      user: {
        select: { name: true, email: true },
      },
    },
  });

  console.log(`Found ${cardsWithoutVariant.length} cards without variants`);

  if (cardsWithoutVariant.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  if (deleteMode) {
    console.log("\n🗑️  DELETE MODE: Removing cards without variants...");

    const result = await prisma.collectionCard.deleteMany({
      where: {
        variantId: null,
      },
    });

    console.log(`Deleted ${result.count} collection cards`);
    return;
  }

  // Fix mode: try to assign variants
  console.log("\n🔧 FIX MODE: Assigning variants to cards...");

  let fixed = 0;
  let failed = 0;

  for (const cc of cardsWithoutVariant) {
    const card = cc.card;

    if (!card.variants || card.variants.length === 0) {
      console.log(`  ❌ ${card.name}: No variants available`);
      failed++;
      continue;
    }

    // Pick the best variant (prefer Standard finish, then first available)
    let variant = card.variants.find((v) => v.finish === cc.finish);
    if (!variant) {
      variant = card.variants.find((v) => v.finish === "Standard");
    }
    if (!variant) {
      variant = card.variants[0];
    }

    try {
      await prisma.collectionCard.update({
        where: { id: cc.id },
        data: {
          variantId: variant.id,
          setId: variant.setId,
        },
      });
      console.log(
        `  ✓ ${card.name}: Assigned variant from ${
          variant.set?.name || "unknown set"
        }`
      );
      fixed++;
    } catch (e) {
      // Might fail due to unique constraint if another entry exists
      console.log(`  ❌ ${card.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Fixed: ${fixed}, Failed: ${failed}`);

  if (failed > 0) {
    console.log(
      "\nTo delete unfixable cards, run: node scripts/fix-collection-variants.js --delete"
    );
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

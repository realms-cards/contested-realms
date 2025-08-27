// Import directly from the compiled module or use a different approach
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Copy the generateBooster function logic for testing
async function testGenerateBooster(setName) {
  const set = await prisma.set.findUnique({ where: { name: setName }, include: { packConfig: true } });
  if (!set || !set.packConfig) {
    throw new Error(`Set or PackConfig not found for set=${setName}`);
  }
  console.log(`Found set: ${set.name} with PackConfig`);
  return { set, packConfig: set.packConfig };
}

async function main() {
  try {
    console.log('Testing booster generation for Arthurian Legends...');
    const booster = await generateBooster('Arthurian Legends');
    console.log(`✅ Generated booster with ${booster.length} cards`);
    console.log('Sample cards:');
    booster.slice(0, 3).forEach(card => {
      console.log(`  ${card.cardName} (${card.rarity}) - ${card.slug}`);
    });
  } catch (error) {
    console.error('❌ Error generating booster:');
    console.error(error.message);
    console.error(error.stack);
  }
}

main();

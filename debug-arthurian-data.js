const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const arthurianSet = await prisma.set.findUnique({ 
    where: { name: 'Arthurian Legends' }
  });
  
  if (!arthurianSet) {
    console.log('❌ Arthurian Legends set not found');
    return;
  }
  
  console.log(`✅ Arthurian Legends set ID: ${arthurianSet.id}`);
  
  // Check CardSetMetadata
  const metadataCount = await prisma.cardSetMetadata.count({
    where: { setId: arthurianSet.id }
  });
  console.log(`CardSetMetadata records: ${metadataCount}`);
  
  // Check Variants  
  const variantCount = await prisma.variant.count({
    where: { setId: arthurianSet.id }
  });
  console.log(`Variant records: ${variantCount}`);
  
  // Check specific booster variants
  const boosterVariants = await prisma.variant.count({
    where: { 
      setId: arthurianSet.id,
      product: 'Booster'
    }
  });
  console.log(`Booster variant records: ${boosterVariants}`);
  
  // Sample some metadata if it exists
  if (metadataCount > 0) {
    const sampleMeta = await prisma.cardSetMetadata.findMany({
      where: { setId: arthurianSet.id },
      take: 5,
      include: { card: { select: { name: true } } }
    });
    
    console.log('\nSample CardSetMetadata:');
    for (const meta of sampleMeta) {
      console.log(`  ${meta.card.name} - ${meta.rarity} ${meta.type}`);
    }
  }
  
  // Sample some variants if they exist  
  if (variantCount > 0) {
    const sampleVariants = await prisma.variant.findMany({
      where: { setId: arthurianSet.id },
      take: 5
    });
    
    console.log('\nSample Variants:');
    for (const variant of sampleVariants) {
      console.log(`  ${variant.slug} - ${variant.finish} ${variant.product}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

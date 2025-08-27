const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== SETS ===');
  const sets = await prisma.set.findMany({
    orderBy: { name: 'asc' },
    include: { packConfig: true }
  });
  
  for (const set of sets) {
    console.log(`${set.name} (ID: ${set.id})`);
    if (set.packConfig) {
      console.log(`  ✅ Has PackConfig`);
    } else {
      console.log(`  ❌ NO PackConfig`);
    }
  }
  
  console.log('\n=== PACK CONFIGS ===');
  const configs = await prisma.packConfig.findMany({
    include: { set: true }
  });
  
  for (const config of configs) {
    console.log(`PackConfig for: ${config.set.name} (setId: ${config.setId})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

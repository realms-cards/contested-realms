const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSetLookup(setName) {
  console.log(`Testing lookup for: "${setName}"`);
  console.log(`String length: ${setName.length}`);
  console.log(`Encoded: ${JSON.stringify(setName)}`);
  
  const set = await prisma.set.findUnique({ 
    where: { name: setName }, 
    include: { packConfig: true } 
  });
  
  if (set) {
    console.log(`✅ Found set: ${set.name} (ID: ${set.id})`);
    console.log(`PackConfig exists: ${!!set.packConfig}`);
  } else {
    console.log(`❌ Set not found`);
    
    // Let's see what sets we do have
    const allSets = await prisma.set.findMany();
    console.log('Available sets:');
    for (const s of allSets) {
      console.log(`  "${s.name}" (${s.name.length} chars)`);
    }
  }
}

async function main() {
  await testSetLookup('Arthurian Legends');
  await testSetLookup('Alpha');
  await testSetLookup('Beta');
}

main().catch(console.error).finally(() => prisma.$disconnect());

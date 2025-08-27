/*
  Seed PackConfig for known sets (Alpha, Beta).
*/
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function upsertSet(name, releasedAt) {
  let set = await prisma.set.findUnique({ where: { name } });
  if (!set) {
    set = await prisma.set.create({
      data: { name, releasedAt: releasedAt ? new Date(releasedAt) : null },
    });
  }
  return set;
}

async function upsertPackConfig(setId, cfg) {
  const existing = await prisma.packConfig.findUnique({ where: { setId } });
  if (!existing) {
    return prisma.packConfig.create({ data: { setId, ...cfg } });
  }
  return prisma.packConfig.update({ where: { setId }, data: cfg });
}

async function main() {
  // Alpha (from collector sources)
  const alpha = await upsertSet("Alpha");
  await upsertPackConfig(alpha.id, {
    ordinaryCount: 10,
    exceptionalCount: 3,
    eliteOrUniqueCount: 1,
    uniqueChance: 0.2, // 20%
    siteOrAvatarCount: 1,
    foilChance: 0.25, // 25% chance
    foilUniqueWeight: 1,
    foilEliteWeight: 3,
    foilExceptionalWeight: 6,
    foilOrdinaryWeight: 7,
    foilReplacesOrdinary: true,
  });

  // Beta (baseline; exact foil/unique odds TBD)
  const beta = await upsertSet("Beta");
  await upsertPackConfig(beta.id, {
    ordinaryCount: 11,
    exceptionalCount: 3,
    eliteOrUniqueCount: 1,
    uniqueChance: 0.2, // placeholder until confirmed
    siteOrAvatarCount: 0,
    foilChance: 0.25, // provisional
    foilUniqueWeight: 1,
    foilEliteWeight: 3,
    foilExceptionalWeight: 6,
    foilOrdinaryWeight: 7,
    foilReplacesOrdinary: true,
  });

  // Arthurian Legends
  const arthurian = await upsertSet("Arthurian Legends");
  await upsertPackConfig(arthurian.id, {
    ordinaryCount: 11,
    exceptionalCount: 3,
    eliteOrUniqueCount: 1,
    uniqueChance: 0.2, // standard rate
    siteOrAvatarCount: 0,
    foilChance: 0.25, // standard rate
    foilUniqueWeight: 1,
    foilEliteWeight: 3,
    foilExceptionalWeight: 6,
    foilOrdinaryWeight: 7,
    foilReplacesOrdinary: true,
  });

  console.log("Seeded PackConfig for Alpha, Beta, and Arthurian Legends.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

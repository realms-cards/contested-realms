/*
  Seed PackConfig for known sets (Alpha, Beta).
*/
// Load .env for local development
try {
  require("dotenv").config();
} catch {}
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
  // Alpha (11 Ordinary, 3 Exceptional, 1 Elite with Unique upgrade chance)
  const alpha = await upsertSet("Alpha");
  await upsertPackConfig(alpha.id, {
    ordinaryCount: 11,
    exceptionalCount: 3,
    eliteOrUniqueCount: 1,
    uniqueChance: 0.125, // 1 in 8 packs has Unique instead of Elite
    siteOrAvatarCount: 0,
    foilChance: 0.25,
    foilUniqueWeight: 1,
    foilEliteWeight: 3,
    foilExceptionalWeight: 6,
    foilOrdinaryWeight: 7,
    foilReplacesOrdinary: true,
  });

  // Beta (11 Ordinary, 3 Exceptional, 1 Elite with Unique upgrade chance)
  const beta = await upsertSet("Beta");
  await upsertPackConfig(beta.id, {
    ordinaryCount: 11,
    exceptionalCount: 3,
    eliteOrUniqueCount: 1,
    uniqueChance: 0.125, // 1 in 8 packs has Unique instead of Elite
    siteOrAvatarCount: 0,
    foilChance: 0.25,
    foilUniqueWeight: 1,
    foilEliteWeight: 3,
    foilExceptionalWeight: 6,
    foilOrdinaryWeight: 7,
    foilReplacesOrdinary: true,
  });

  // Arthurian Legends (11 Ordinary, 3 Exceptional, 1 Elite with Unique upgrade chance)
  const arthurian = await upsertSet("Arthurian Legends");
  await upsertPackConfig(arthurian.id, {
    ordinaryCount: 11,
    exceptionalCount: 3,
    eliteOrUniqueCount: 1,
    uniqueChance: 0.125, // 1 in 8 packs has Unique instead of Elite
    siteOrAvatarCount: 0,
    foilChance: 0.25,
    foilUniqueWeight: 1,
    foilEliteWeight: 3,
    foilExceptionalWeight: 6,
    foilOrdinaryWeight: 7,
    foilReplacesOrdinary: true,
  });

  // Dragonlord (mini-set with fixed booster - all cards in one pack)
  const dragonlord = await upsertSet("Dragonlord");
  await upsertPackConfig(dragonlord.id, {
    ordinaryCount: 0, // Not used for fixed packs
    exceptionalCount: 0,
    eliteOrUniqueCount: 0,
    uniqueChance: 0,
    siteOrAvatarCount: 0,
    foilChance: 0,
    foilUniqueWeight: 0,
    foilEliteWeight: 0,
    foilExceptionalWeight: 0,
    foilOrdinaryWeight: 0,
    foilReplacesOrdinary: false,
    isFixedPack: true, // All cards come in one booster
  });

  // Gothic (11 Ordinary, 3 Exceptional, 1 Elite with Unique upgrade chance)
  const gothic = await upsertSet("Gothic");
  await upsertPackConfig(gothic.id, {
    ordinaryCount: 11,
    exceptionalCount: 3,
    eliteOrUniqueCount: 1,
    uniqueChance: 0.125, // 1 in 8 packs has Unique instead of Elite
    siteOrAvatarCount: 0, // no extra site/avatar slots in Gothic
    foilChance: 0.25, // standard rate
    foilUniqueWeight: 1,
    foilEliteWeight: 3,
    foilExceptionalWeight: 6,
    foilOrdinaryWeight: 7,
    foilReplacesOrdinary: true,
  });

  console.log(
    "Seeded PackConfig for Alpha, Beta, Arthurian Legends, Dragonlord, and Gothic."
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

/**
 * Backfill script: tag existing precon matches with isPrecon = true.
 *
 * Identification strategy:
 * 1. Load all precon decks from DB (owned by "public-decks@system.local")
 * 2. Build a fingerprint (sorted card-name set) for each precon deck
 * 3. Scan OnlineMatchSession rows where matchType = 'constructed' and playerDecks IS NOT NULL
 * 4. For each player deck in the session, build the same fingerprint
 * 5. If ANY player's deck matches a precon fingerprint → mark session + its MatchResult as isPrecon
 *
 * Usage: node scripts/backfill-precon-matches.js [--dry-run]
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

const SYSTEM_EMAIL = "public-decks@system.local";

/**
 * Build a stable fingerprint from a list of card names.
 * Takes array of {name, zone, type} objects (from playerDecks JSON),
 * filters to spellbook+atlas cards (excluding avatar and collection zone),
 * sorts names, and joins.
 */
function buildFingerprint(cards) {
  if (!Array.isArray(cards)) return "";
  const names = [];
  for (const card of cards) {
    if (!card || !card.name) continue;
    // Skip collection zone
    if (
      typeof card.zone === "string" &&
      card.zone.toLowerCase() === "collection"
    )
      continue;
    // Skip avatar (by type from playerDecks JSON, or by zone from DeckCard)
    if (typeof card.type === "string" && card.type.toLowerCase().includes("avatar"))
      continue;
    if (typeof card.zone === "string" && card.zone.toLowerCase() === "avatar")
      continue;
    names.push(card.name);
  }
  return names.sort().join("|");
}

async function main() {
  console.log(`Backfill precon matches${DRY_RUN ? " (DRY RUN)" : ""}`);

  // 1. Find system user
  const systemUser = await prisma.user.findFirst({
    where: { email: SYSTEM_EMAIL },
  });
  if (!systemUser) {
    console.log("No system user found — no precon decks to match against.");
    return;
  }
  console.log(`System user: ${systemUser.id} (${systemUser.name})`);

  // 2. Load precon decks with their cards
  const preconDecks = await prisma.deck.findMany({
    where: {
      userId: systemUser.id,
      isPublic: true,
    },
    include: {
      cards: {
        include: { card: { select: { name: true } } },
      },
    },
  });
  console.log(`Found ${preconDecks.length} precon decks`);

  // 3. Build fingerprints
  const preconFingerprints = new Set();
  for (const deck of preconDecks) {
    // Expand by count (some cards have count > 1)
    const expanded = [];
    for (const dc of deck.cards) {
      for (let i = 0; i < dc.count; i++) {
        expanded.push({
          name: dc.card.name,
          zone: dc.zone,
        });
      }
    }
    const fp = buildFingerprint(expanded);
    if (fp) {
      preconFingerprints.add(fp);
      console.log(`  Precon "${deck.name}": ${fp.substring(0, 80)}...`);
    }
  }
  console.log(`Built ${preconFingerprints.size} unique precon fingerprints`);

  if (preconFingerprints.size === 0) {
    console.log("No fingerprints to match — done.");
    return;
  }

  // 4. Scan match sessions
  const sessions = await prisma.$queryRaw`
    SELECT oms.id, oms."playerDecks"
    FROM "OnlineMatchSession" oms
    WHERE oms."matchType" = 'constructed'
      AND oms."playerDecks" IS NOT NULL
      AND oms."isPrecon" = false
    ORDER BY oms."createdAt" DESC
  `;

  console.log(`Scanning ${sessions.length} constructed sessions...`);

  let taggedSessions = 0;
  let taggedResults = 0;
  const sessionIdsToTag = [];

  for (const session of sessions) {
    const playerDecks = session.playerDecks;
    if (!playerDecks || typeof playerDecks !== "object") continue;

    let isPrecon = false;
    for (const [, cards] of Object.entries(playerDecks)) {
      if (!Array.isArray(cards)) continue;
      const fp = buildFingerprint(cards);
      if (fp && preconFingerprints.has(fp)) {
        isPrecon = true;
        break;
      }
    }

    if (isPrecon) {
      sessionIdsToTag.push(session.id);
    }
  }

  console.log(`Found ${sessionIdsToTag.length} precon sessions to tag`);

  if (sessionIdsToTag.length === 0) {
    console.log("No precon sessions found — done.");
    return;
  }

  // 5. Tag sessions and match results in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < sessionIdsToTag.length; i += BATCH_SIZE) {
    const batch = sessionIdsToTag.slice(i, i + BATCH_SIZE);

    if (!DRY_RUN) {
      const [sessionResult, resultResult] = await prisma.$transaction([
        prisma.onlineMatchSession.updateMany({
          where: { id: { in: batch } },
          data: { isPrecon: true },
        }),
        prisma.matchResult.updateMany({
          where: { matchId: { in: batch } },
          data: { isPrecon: true },
        }),
      ]);
      taggedSessions += sessionResult.count;
      taggedResults += resultResult.count;
    } else {
      taggedSessions += batch.length;
      // Estimate results
      const resultCount = await prisma.matchResult.count({
        where: { matchId: { in: batch } },
      });
      taggedResults += resultCount;
    }

    console.log(
      `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: tagged ${batch.length} sessions`
    );
  }

  console.log(`\nDone! Tagged ${taggedSessions} sessions and ${taggedResults} match results as precon.`);
  if (DRY_RUN) {
    console.log("(Dry run — no changes were made)");
  }
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

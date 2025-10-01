#!/usr/bin/env node
// Create or replace a deck that contains one copy of every card in the database.
// Usage: USER_ID=<uuid> node scripts/create-all-cards-deck.js
//    or: node scripts/create-all-cards-deck.js <uuid>

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const DECK_NAME = "All Cards Test Deck";
const SET_PRIORITY = [
  "Beta",
  "Alpha",
  "Arthurian Legends",
  "Dragonlord",
  "Promo",
  "Sample Decks",
];

function priorityOf(setName) {
  const idx = SET_PRIORITY.indexOf(setName);
  return idx === -1 ? SET_PRIORITY.length : idx;
}

function inferZone(typeText, avatarAssigned) {
  const lower = (typeText || "").toLowerCase();
  const isAvatar = lower.includes("avatar");
  const isSite = lower.includes("site");
  if (isSite) return { zone: "Atlas", isAvatar: false };
  if (isAvatar) {
    return { zone: avatarAssigned ? "Sideboard" : "Spellbook", isAvatar: true };
  }
  return { zone: "Spellbook", isAvatar: false };
}

async function main() {
  const userId = process.env.USER_ID || process.argv[2];
  if (!userId) {
    console.error("Pass USER_ID env or first argument (user ID)");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`User ${userId} not found.`);
    process.exit(1);
  }

  console.log(`Creating \"${DECK_NAME}\" for user ${userId} (${user.name || "unnamed"})`);

  await prisma.deck.deleteMany({ where: { userId, name: DECK_NAME } });

  const cards = await prisma.card.findMany({
    include: {
      meta: {
        include: { set: true },
      },
      variants: true,
    },
    orderBy: { name: "asc" },
  });

  let avatarAssigned = false;
  const deckCards = [];

  for (const card of cards) {
    const metaSorted = [...card.meta].sort((a, b) => {
      return priorityOf(a.set?.name || "") - priorityOf(b.set?.name || "");
    });
    const chosenMeta = metaSorted[0] || null;
    const typeText = chosenMeta?.type || card.variants[0]?.typeText || "";
    const { zone, isAvatar } = inferZone(typeText, avatarAssigned);
    if (isAvatar && !avatarAssigned) avatarAssigned = true;

    const chosenVariant = card.variants.find((v) => v.setId === chosenMeta?.setId) || card.variants[0] || null;

    deckCards.push({
      zone,
      count: 1,
      cardId: card.id,
      setId: chosenMeta?.setId || null,
      variantId: chosenVariant?.id || null,
    });
  }

  if (!avatarAssigned) {
    console.warn("Warning: no avatar detected; deck may be invalid.");
  }

  const deck = await prisma.deck.create({
    data: {
      userId,
      name: DECK_NAME,
      isPublic: false,
      format: "Constructed",
      cards: {
        createMany: {
          data: deckCards,
        },
      },
    },
  });

  console.log(
    `Created deck ${deck.id} with ${deckCards.length} unique cards.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

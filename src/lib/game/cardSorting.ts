// Shared 3D card sorting, categorization and stacking utilities

export type Rarity = "Ordinary" | "Exceptional" | "Elite" | "Unique";
export type Finish = "Standard" | "Foil";

export type BoosterCard = {
  variantId: number;
  slug: string;
  finish: Finish;
  product: string;
  rarity: Rarity;
  type: string | null;
  cardId: number;
  cardName: string;
  // Optional local enrichment: which set this card came from
  setName?: string;
};

export type CardMeta = {
  // Optional id included in some API shapes; not required by logic here
  cardId?: number;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  thresholds: Record<string, number> | null;
};

export type Pick3D = {
  id: number;
  card: BoosterCard;
  x: number;
  z: number;
  // Optional vertical offset used by some UIs to influence render order
  y?: number;
};

export type StackPosition = {
  x: number;
  z: number;
  stackIndex: number;
  isVisible: boolean;
};

export type CategorizedPicks = {
  creatures?: Pick3D[];
  spells?: Pick3D[];
  sites?: Pick3D[];
  avatars?: Pick3D[];
  [key: string]: Pick3D[] | undefined;
};

export function categorizeCard(
  card: BoosterCard,
  meta?: CardMeta
): "creatures" | "spells" | "sites" | "avatars" {
  const type = (card.type || "").toLowerCase();
  if (type.includes("site")) return "sites";
  if (type.includes("avatar")) return "avatars";
  const isCreature = meta && (meta.attack !== null || meta.defence !== null);
  if (isCreature) return "creatures";
  return "spells";
}

export function getThresholdElements(
  _card: BoosterCard,
  meta?: CardMeta
): string[] {
  const thresholds = (meta?.thresholds ?? {}) as Record<string, number>;
  return Object.keys(thresholds).filter((element) => thresholds[element] > 0);
}

export function categorizeAndSortPicks(
  picks: Pick3D[],
  metaByCardId: Record<number, CardMeta>
): CategorizedPicks {
  const categorized = picks.reduce((acc, pick) => {
    const meta = metaByCardId[pick.card.cardId];
    const category = categorizeCard(pick.card, meta);
    if (!acc[category]) acc[category] = [];
    acc[category]!.push(pick);
    return acc;
  }, {} as CategorizedPicks);

  // Sort within each category by mana cost asc
  for (const category in categorized) {
    const arr = categorized[category];
    if (!arr) continue;
    arr.sort((a, b) => {
      const metaA = metaByCardId[a.card.cardId];
      const metaB = metaByCardId[b.card.cardId];
      const costA = metaA?.cost || 0;
      const costB = metaB?.cost || 0;
      return costA - costB;
    });
  }
  return categorized;
}

// Enhanced categorization for deck vs sideboard sorting
function categorizeCardByZone(
  card: Pick3D["card"],
  meta?: CardMeta,
  zone?: "Deck" | "Sideboard"
) {
  const type = (card.type || "").toLowerCase();

  if (type.includes("avatar")) return "avatars";

  // Sites get special handling based on zone
  if (type.includes("site")) {
    if (zone === "Deck") {
      // For deck, sites are grouped by element
      const thresholds = meta?.thresholds as Record<string, number> | undefined;
      let primaryElement = "colorless";

      if (thresholds) {
        const elements = ["air", "water", "earth", "fire"];
        const maxElement = elements.reduce((max, element) =>
          (thresholds[element] || 0) > (thresholds[max] || 0) ? element : max
        );
        if (thresholds[maxElement] > 0) {
          primaryElement = maxElement;
        }
      }

      return `sites-${primaryElement}`;
    } else {
      return "sites"; // Sideboard sites grouped together
    }
  }

  if (zone === "Deck") {
    // For deck, group by mana cost and separate creatures/spells
    const cost = meta?.cost ?? 0;
    const isCreature = meta && (meta.attack !== null || meta.defence !== null);
    return `mana-${cost}-${isCreature ? "creatures" : "spells"}`;
  } else {
    // For sideboard, group by element and creature/spell type
    const thresholds = meta?.thresholds as Record<string, number> | undefined;
    let primaryElement = "colorless";

    if (thresholds) {
      const elements = ["air", "water", "earth", "fire"];
      const maxElement = elements.reduce((max, element) =>
        (thresholds[element] || 0) > (thresholds[max] || 0) ? element : max
      );
      if (thresholds[maxElement] > 0) {
        primaryElement = maxElement;
      }
    }

    // Check if creature based on attack/defence
    const isCreature = meta && (meta.attack !== null || meta.defence !== null);

    return `${primaryElement}-${isCreature ? "creatures" : "spells"}`;
  }
}

export function computeStackPositions(
  picks: Pick3D[],
  metaByCardId: Record<number, CardMeta>,
  isSortingEnabled: boolean
): Map<number, StackPosition> | null {
  if (!isSortingEnabled) return null;

  const positions = new Map<number, StackPosition>();
  const cardSpacing = 0.15; // Vertical spacing between cards

  // Separate cards by zone first
  const deckCards = picks.filter((pick) => pick.z < 0);
  const sideboardCards = picks.filter((pick) => pick.z >= 0);

  // Categorize deck cards by mana cost and sites by element
  const deckCategories = deckCards.reduce((acc, pick) => {
    const meta = metaByCardId[pick.card.cardId];
    const category = categorizeCardByZone(pick.card, meta, "Deck");
    if (!acc[category]) acc[category] = [];
    acc[category].push(pick);
    return acc;
  }, {} as Record<string, Pick3D[]>);

  // Categorize sideboard cards by element and creature/spell type
  const sideboardCategories = sideboardCards.reduce((acc, pick) => {
    const meta = metaByCardId[pick.card.cardId];
    const category = categorizeCardByZone(pick.card, meta, "Sideboard");
    if (!acc[category]) acc[category] = [];
    acc[category].push(pick);
    return acc;
  }, {} as Record<string, Pick3D[]>);

  // Sort within each category
  Object.values(deckCategories).forEach((cards) => {
    cards.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName));
  });

  Object.values(sideboardCategories).forEach((cards) => {
    cards.sort((a, b) => {
      const metaA = metaByCardId[a.card.cardId];
      const metaB = metaByCardId[b.card.cardId];
      const costA = metaA?.cost ?? 0;
      const costB = metaB?.cost ?? 0;
      return costA - costB;
    });
  });

  // Deck positioning - place near TOP of the board
  // Use two rows near the top: deck on top row, sideboard just below it
  const deckZStart = -3.0; // farther toward the top edge
  let deckXStart = -4; // Start further left
  const deckSpacing = 0.8;

  // First, position mana cost stacks (creatures on top, spells below)
  const manaCosts = Array.from(new Set(
    Object.keys(deckCategories)
      .filter((key) => key.startsWith("mana-"))
      .map((key) => parseInt(key.split("-")[1]))
  )).sort((a, b) => a - b);

  manaCosts.forEach((cost) => {
    // Creatures first
    const creatureKey = `mana-${cost}-creatures`;
    if (deckCategories[creatureKey]) {
      deckCategories[creatureKey].forEach((card, index) => {
        positions.set(card.id, {
          x: deckXStart,
          z: deckZStart + index * cardSpacing,
          stackIndex: index,
          isVisible: true,
        });
      });
    }

    // Spells below creatures
    const spellKey = `mana-${cost}-spells`;
    if (deckCategories[spellKey]) {
      const creatureCount = deckCategories[creatureKey]?.length || 0;
      deckCategories[spellKey].forEach((card, index) => {
        positions.set(card.id, {
          x: deckXStart,
          z: deckZStart + (creatureCount + index + 0.5) * cardSpacing,
          stackIndex: creatureCount + index,
          isVisible: true,
        });
      });
    }

    // Only advance X if we actually placed cards
    if (deckCategories[creatureKey] || deckCategories[spellKey]) {
      deckXStart += deckSpacing;
    }
  });

  // Then, position site stacks by element in deck
  const siteElements = ["air", "water", "earth", "fire", "colorless"];
  siteElements.forEach((element) => {
    const siteKey = `sites-${element}`;
    if (deckCategories[siteKey]) {
      deckCategories[siteKey].forEach((card, index) => {
        positions.set(card.id, {
          x: deckXStart,
          z: deckZStart + index * cardSpacing,
          stackIndex: index,
          isVisible: true,
        });
      });
      deckXStart += deckSpacing;
    }
  });

  // Handle avatars in deck (should be rare but possible)
  if (deckCategories["avatars"]) {
    deckCategories["avatars"].forEach((card, index) => {
      positions.set(card.id, {
        x: deckXStart,
        z: deckZStart + index * cardSpacing,
        stackIndex: index,
        isVisible: true,
      });
    });
  }

  // Sideboard positioning - also near TOP (just beneath deck row)
  const sideboardZStart = -2.2;
  let sideboardXStart = 0; // Start on right side
  const sideboardSpacing = 0.7;

  const elementOrder = ["air", "water", "earth", "fire", "colorless"];
  elementOrder.forEach((element) => {
    // Creatures stack
    const creatureKey = `${element}-creatures`;
    if (sideboardCategories[creatureKey]) {
      sideboardCategories[creatureKey].forEach((card, index) => {
        positions.set(card.id, {
          x: sideboardXStart,
          z: sideboardZStart + index * cardSpacing,
          stackIndex: index,
          isVisible: true,
        });
      });
    }

    // Spells stack (below creatures)
    const spellKey = `${element}-spells`;
    if (sideboardCategories[spellKey]) {
      const creatureCount = sideboardCategories[creatureKey]?.length || 0;
      sideboardCategories[spellKey].forEach((card, index) => {
        positions.set(card.id, {
          x: sideboardXStart,
          z: sideboardZStart + (creatureCount + index + 0.5) * cardSpacing,
          stackIndex: creatureCount + index,
          isVisible: true,
        });
      });
    }

    // Only advance X if we actually placed cards
    if (sideboardCategories[creatureKey] || sideboardCategories[spellKey]) {
      sideboardXStart += sideboardSpacing;
    }
  });

  // Handle sites and avatars in sideboard
  if (sideboardCategories["sites"]) {
    sideboardCategories["sites"].forEach((card, index) => {
      positions.set(card.id, {
        x: sideboardXStart,
        z: sideboardZStart + index * cardSpacing,
        stackIndex: index,
        isVisible: true,
      });
    });
    sideboardXStart += sideboardSpacing;
  }

  if (sideboardCategories["avatars"]) {
    sideboardCategories["avatars"].forEach((card, index) => {
      positions.set(card.id, {
        x: sideboardXStart,
        z: sideboardZStart + index * cardSpacing,
        stackIndex: index,
        isVisible: true,
      });
    });
  }

  return positions;
}

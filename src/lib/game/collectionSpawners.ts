/**
 * Collection Spawners - Cards that can summon/cast/transform cards from your collection
 *
 * In limited formats (sealed/draft), your collection includes all unplayed cards in your card pool.
 * Furthermore, whenever an effect specifies a named card in your collection, you simply get one
 * as if it were in your collection.
 *
 * This module defines which cards can spawn other cards from collection, so we can dynamically
 * inject those cards into the collection zone for sealed/draft matches.
 */

/**
 * Mapping of card names (lowercase) to the cards they can spawn from collection.
 * Each spawner maps to an array of card names that should be injected into collection.
 */
export const COLLECTION_SPAWNERS: Record<string, string[]> = {
  // Sites that summon, cast or transform cards from your collection
  "molten maar": ["Hellhounds"],
  "forsaken crypt": ["Ghoul"],
  "peculiar port": ["Horrible Hybrids"],
  "forlorn keep": ["Penitent Knight"],
  "troubled town": ["Eltham Townsfolk", "Serava Townsfolk"],
  "gilman house": ["Horrible Hybrids"],
  "elder ruins": ["Shoggoth"],

  // Spells and Avatar that summon, cast or transform cards from your collection
  "release the hounds": ["Hellhounds", "Hellhounds"], // 2x Hellhounds
  "those who linger": ["Ghoul"],
  "young master damion": ["Ghoul", "Ghoul"], // 2x Ghoul
  monstermorphosis: ["Horrible Hybrids"],
  "estranged loner": ["Horrible Hybrids"],
  consecrate: ["Consecrated Ground"],
  desecrate: ["Desecrated Ground"],
  "harvest festival": ["Eltham Townsfolk", "Serava Townsfolk"],
};

/**
 * Get all unique card names that should be spawned for a given deck.
 * Returns an array of card names (not lowercased) that need to be in the collection.
 *
 * @param deckCardNames - Array of card names in the deck (case-insensitive)
 * @returns Array of unique card names to inject into collection
 */
export function getSpawnedCollectionCards(deckCardNames: string[]): string[] {
  const spawnedSet = new Set<string>();

  for (const cardName of deckCardNames) {
    const normalizedName = cardName.toLowerCase().trim();
    const spawned = COLLECTION_SPAWNERS[normalizedName];
    if (spawned) {
      for (const spawnedCard of spawned) {
        spawnedSet.add(spawnedCard);
      }
    }
  }

  return Array.from(spawnedSet);
}

/**
 * Check if a deck contains any cards that can spawn collection cards.
 *
 * @param deckCardNames - Array of card names in the deck (case-insensitive)
 * @returns true if any card in the deck can spawn collection cards
 */
export function hasCollectionSpawners(deckCardNames: string[]): boolean {
  for (const cardName of deckCardNames) {
    const normalizedName = cardName.toLowerCase().trim();
    if (COLLECTION_SPAWNERS[normalizedName]) {
      return true;
    }
  }
  return false;
}

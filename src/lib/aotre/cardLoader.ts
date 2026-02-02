/**
 * Attack of the Realm Eater - Card Loading
 *
 * Fetches real Sorcery cards from the database for use in AOTRE mode
 */

import type { CardRef, Thresholds } from "@/lib/game/store";

/** Card search result from API */
interface CardSearchResult {
  cardId: number;
  variantId: number;
  cardName: string;
  slug: string;
  type: string | null;
  subTypes: string | null;
  rarity: string | null;
  set: string;
}

/** Card lookup result from API */
interface CardLookupResult {
  cardId: number;
  variantId: number;
  name: string;
  slug: string;
  type: string | null;
  subTypes: string | null;
  rarity: string | null;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  thresholds: Partial<Thresholds> | null;
}

/**
 * Known site cards from Sorcery precon decks (Beta set)
 * These are real card names that exist in the database
 */
const KNOWN_SITES = [
  // Fire sites
  "Arid Desert", "Red Desert", "Remote Desert", "Shifting Sands", "Vesuvius", "Cornerstone",
  // Earth sites
  "Bedrock", "Holy Ground", "Humble Village", "Quagmire", "Rustic Village",
  "Simple Village", "Sinkhole", "Vantage Hills",
  // Air sites
  "Cloud City", "Dark Tower", "Gothic Tower", "Lone Tower",
  "Mountain Pass", "Observatory", "Planar Gate", "Updraft Ridge",
  // Water sites
  "Autumn River", "Floodplain", "Island Leviathan", "Maelström",
  "Spring River", "Summer River", "Undertow",
];

/**
 * Known avatar cards from Sorcery precon decks
 */
const KNOWN_AVATARS = [
  "Flamecaller", "Geomancer", "Sparkmage", "Waveshaper"
];

/**
 * Known spell/unit cards from Sorcery precon decks
 */
const KNOWN_SPELLS = [
  // Fire spells/units
  "Askelon Phoenix", "Blaze", "Fireball", "Firebolts", "Heat Ray", "Incinerate",
  "Lava Salamander", "Mad Dash", "Ogre Goons", "Sand Worm",
  // Earth spells/units
  "Amazon Warriors", "Autumn Unicorn", "Cave Trolls", "Cave-In", "Divine Healing",
  "Mountain Giant", "Overpower", "Rolling Boulder", "Wild Boars",
  // Air spells/units
  "Apprentice Wizard", "Blink", "Chain Lightning", "Cloud Spirit", "Lightning Bolt",
  "Midnight Rogue", "Plumed Pegasus", "Raise Dead", "Snow Leopard", "Teleport",
  // Water spells/units
  "Anui Undine", "Coral-Reef Kelpie", "Deep-Sea Mermaids", "Drown", "Ice Lance",
  "Polar Bears", "Riptide", "Sea Serpent", "Tide Naiads", "Wrath of the Sea",
];

/**
 * Official Realm Eater Minion Deck (from OOPMan's sample decks)
 * Card name -> count mapping
 */
const OFFICIAL_RE_MINION_DECK: Record<string, number> = {
  "Balor of the Evil Eye": 1,
  "Hellstar": 1,
  "Draconian Bonekite": 1,
  "Great Old One": 1,
  "Army of the Dead": 1,
  "Lord of the Void": 1,
  "Vatn Draconis": 1,
  "Adtonitum": 1,
  "Lord of Destruction": 2,
  "Infernal Legion": 2,
  "Lord of Greed": 2,
  "Diluvian Kraken": 2,
  "Wraetannis Titan": 2,
  "Nightmare": 2,
  "Panorama Manticore": 2,
  "Ten-tonne Slug": 2,
  "Karkemish Chimera": 2,
  "Mountain Giant": 2,
  "Conqueror Worm": 2,
};

/**
 * Official Realm Eater Magic Deck (from OOPMan's sample decks)
 * Card name -> count mapping
 */
const OFFICIAL_RE_MAGIC_DECK: Record<string, number> = {
  "Meteor Shower": 2,
  "Craterize": 2,
  "Abyssal Assault": 3,
  "Thunderstorm": 3,
  "Cone of Flame": 3,
  "Wrath of the Sea": 2,
  "Earthquake": 2,
  "Stone Rain": 3,
  "Chain Lightning": 3,
  "Call of the Sea": 2,
  "Blasphemy": 1,
  "Flame Wave": 2,
  "Ball Lightning": 1,
  "The Black Plague": 1,
};

// Flatten to arrays for backward compat
const _KNOWN_RE_MINIONS = Object.keys(OFFICIAL_RE_MINION_DECK);
const _KNOWN_RE_MAGIC = Object.keys(OFFICIAL_RE_MAGIC_DECK);

/**
 * Fetch a card by name from the database
 * Searches across all sets to find the card
 */
async function fetchCardByName(name: string, preferredSet?: string): Promise<CardLookupResult | null> {
  try {
    // Search without set filter to find cards across all sets
    const params = new URLSearchParams({ q: name });
    if (preferredSet) {
      params.set("set", preferredSet);
    }
    const response = await fetch(`/api/cards/search?${params.toString()}`);
    if (!response.ok) return null;

    const json = await response.json();

    // Handle both array response and object with results property
    let results: CardSearchResult[];
    if (Array.isArray(json)) {
      results = json;
    } else if (json && Array.isArray(json.results)) {
      results = json.results;
    } else if (json && Array.isArray(json.cards)) {
      results = json.cards;
    } else {
      console.warn(`Unexpected API response format for card: ${name}`, json);
      return null;
    }

    if (results.length === 0) return null;

    // Find exact match
    const exact = results.find(
      (r) => r.cardName?.toLowerCase() === name.toLowerCase()
    );
    const result = exact || results[0];

    // Get full card data with stats
    const lookupParams = new URLSearchParams({
      cardId: String(result.cardId),
      setId: String(result.variantId), // Use variant to get set-specific data
    });
    const lookupResponse = await fetch(`/api/cards/by-id?${lookupParams.toString()}`);
    if (!lookupResponse.ok) {
      // Return basic info without stats
      return {
        cardId: result.cardId,
        variantId: result.variantId,
        name: result.cardName,
        slug: result.slug,
        type: result.type,
        subTypes: result.subTypes,
        rarity: result.rarity,
        cost: null,
        attack: null,
        defence: null,
        thresholds: null,
      };
    }

    const fullData = await lookupResponse.json();
    return {
      cardId: result.cardId,
      variantId: result.variantId,
      name: result.cardName,
      slug: result.slug,
      type: result.type || fullData.type,
      subTypes: result.subTypes || fullData.subTypes,
      rarity: result.rarity || fullData.rarity,
      cost: fullData.cost ?? null,
      attack: fullData.attack ?? null,
      defence: fullData.defence ?? null,
      thresholds: fullData.thresholds ?? null,
    };
  } catch (error) {
    console.error(`Error fetching card ${name}:`, error);
    return null;
  }
}

/**
 * Fetch site cards from the database
 * @param count Number of sites to fetch
 * @param setName Optional set name to filter (e.g., "Alpha", "Beta")
 */
export async function fetchSiteCards(
  count: number,
  _setName?: string
): Promise<CardRef[]> {
  try {
    // Shuffle known sites and fetch them
    const shuffledNames = shuffleArray([...KNOWN_SITES]);
    const cardsToFetch = shuffledNames.slice(0, Math.min(count, shuffledNames.length));

    const fetchPromises = cardsToFetch.map((name) => fetchCardByName(name));
    const results = await Promise.all(fetchPromises);

    // Filter out nulls and convert to CardRef
    const validResults = results.filter((r): r is CardLookupResult => r !== null);

    if (validResults.length === 0) {
      console.warn("No site cards found, using placeholders");
      return generatePlaceholderSites(count);
    }

    // If we didn't get enough, fill with placeholders
    const cards: CardRef[] = validResults.map((card) => ({
      cardId: card.cardId,
      variantId: card.variantId,
      name: card.name,
      slug: card.slug,
      type: card.type ?? "Site",
      subTypes: card.subTypes,
      cost: card.cost,
      attack: card.attack,
      defence: card.defence,
      thresholds: card.thresholds,
      rarity: card.rarity,
    }));

    // Fill remaining slots with duplicates if needed
    while (cards.length < count) {
      const original = cards[cards.length % validResults.length];
      cards.push({ ...original });
    }

    return cards;
  } catch (error) {
    console.error("Error fetching site cards:", error);
    return generatePlaceholderSites(count);
  }
}

/**
 * Fetch spell/unit cards for player hands
 * @param count Number of cards to fetch
 * @param _setName Optional set name to filter
 */
export async function fetchSpellCards(
  count: number,
  _setName?: string
): Promise<CardRef[]> {
  try {
    // Shuffle known spells and fetch them
    const shuffledNames = shuffleArray([...KNOWN_SPELLS]);
    const cardsToFetch = shuffledNames.slice(0, Math.min(count, shuffledNames.length));

    const fetchPromises = cardsToFetch.map((name) => fetchCardByName(name));
    const results = await Promise.all(fetchPromises);

    // Filter out nulls and convert to CardRef
    const validResults = results.filter((r): r is CardLookupResult => r !== null);

    if (validResults.length === 0) {
      console.warn("No spell cards found, using placeholders");
      return generatePlaceholderSpells(count);
    }

    // Build the card list with duplicates if needed
    const cards: CardRef[] = [];

    for (let i = 0; i < count; i++) {
      const card = validResults[i % validResults.length];
      cards.push({
        cardId: card.cardId,
        variantId: card.variantId,
        name: card.name,
        slug: card.slug,
        type: card.type ?? "Spell",
        subTypes: card.subTypes,
        cost: card.cost,
        attack: card.attack,
        defence: card.defence,
        thresholds: card.thresholds,
        rarity: card.rarity,
      });
    }

    return cards;
  } catch (error) {
    console.error("Error fetching spell cards:", error);
    return generatePlaceholderSpells(count);
  }
}

/**
 * Fetch avatar cards
 * @param count Number of avatars to fetch
 * @param _setName Optional set name to filter
 */
export async function fetchAvatarCards(
  count: number,
  _setName?: string
): Promise<CardRef[]> {
  try {
    // Fetch known avatars
    const shuffledNames = shuffleArray([...KNOWN_AVATARS]);
    const cardsToFetch = shuffledNames.slice(0, Math.min(count, shuffledNames.length));

    const fetchPromises = cardsToFetch.map((name) => fetchCardByName(name));
    const results = await Promise.all(fetchPromises);

    // Filter out nulls and convert to CardRef
    const validResults = results.filter((r): r is CardLookupResult => r !== null);

    if (validResults.length === 0) {
      console.warn("No avatar cards found, using placeholders");
      return generatePlaceholderAvatars(count);
    }

    // Build the card list with duplicates if needed
    const cards: CardRef[] = [];

    for (let i = 0; i < count; i++) {
      const card = validResults[i % validResults.length];
      cards.push({
        cardId: card.cardId,
        variantId: card.variantId,
        name: card.name,
        slug: card.slug,
        type: card.type ?? "Avatar",
        subTypes: card.subTypes,
        cost: card.cost,
        attack: card.attack,
        defence: card.defence,
        thresholds: card.thresholds,
        rarity: card.rarity,
      });
    }

    return cards;
  } catch (error) {
    console.error("Error fetching avatar cards:", error);
    return generatePlaceholderAvatars(count);
  }
}

/**
 * Load all cards needed for AOTRE game
 */
export interface AotreCardSet {
  sites: CardRef[];
  playerCards: CardRef[][];
  avatars: CardRef[];
  realmEaterMagic: CardRef[];
  realmEaterMinions: CardRef[];
}

export async function loadAotreCards(
  playerCount: 1 | 2 | 3 | 4,
  siteCount: number,
  setName?: string
): Promise<AotreCardSet> {
  // Fetch all card types in parallel
  const [sites, spells, avatars] = await Promise.all([
    fetchSiteCards(siteCount, setName),
    fetchSpellCards(playerCount * 40, setName), // 40 cards per player
    fetchAvatarCards(playerCount, setName),
  ]);

  // Split spells among players
  const playerCards: CardRef[][] = [];
  const cardsPerPlayer = Math.floor(spells.length / playerCount);
  for (let i = 0; i < playerCount; i++) {
    playerCards.push(spells.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer));
  }

  // Fetch Realm Eater's cards (minions and magic)
  const [realmEaterMagic, realmEaterMinions] = await Promise.all([
    fetchRealmEaterMagic(20, setName),
    fetchRealmEaterMinions(20, setName),
  ]);

  return {
    sites,
    playerCards,
    avatars,
    realmEaterMagic,
    realmEaterMinions,
  };
}

/**
 * Fetch minion cards for Realm Eater to spawn (using official deck list)
 */
async function fetchRealmEaterMinions(
  _count: number,
  _setName?: string
): Promise<CardRef[]> {
  try {
    // Fetch all unique card names from official deck
    const uniqueNames = Object.keys(OFFICIAL_RE_MINION_DECK);
    const fetchPromises = uniqueNames.map((name) => fetchCardByName(name));
    const results = await Promise.all(fetchPromises);

    // Build card lookup
    const cardLookup = new Map<string, CardLookupResult>();
    for (let i = 0; i < uniqueNames.length; i++) {
      const result = results[i];
      if (result) {
        cardLookup.set(uniqueNames[i], result);
      }
    }

    if (cardLookup.size === 0) {
      console.warn("No RE minion cards found, using placeholders");
      return generateRealmEaterMinions(30);
    }

    // Build the deck with proper counts
    const cards: CardRef[] = [];
    for (const [cardName, cardCount] of Object.entries(OFFICIAL_RE_MINION_DECK)) {
      const card = cardLookup.get(cardName);
      if (card) {
        for (let i = 0; i < cardCount; i++) {
          cards.push({
            cardId: card.cardId,
            variantId: card.variantId,
            name: card.name,
            slug: card.slug,
            type: card.type ?? "Minion",
            subTypes: card.subTypes,
            cost: card.cost,
            attack: card.attack,
            defence: card.defence,
            thresholds: card.thresholds,
            rarity: card.rarity,
          });
        }
      } else {
        console.warn(`RE minion card not found: ${cardName}`);
      }
    }

    // Shuffle the deck
    return shuffleArray(cards);
  } catch (error) {
    console.error("Error fetching RE minion cards:", error);
    return generateRealmEaterMinions(30);
  }
}

/**
 * Fetch magic cards for Realm Eater to cast (using official deck list)
 */
async function fetchRealmEaterMagic(
  _count: number,
  _setName?: string
): Promise<CardRef[]> {
  try {
    // Fetch all unique card names from official deck
    const uniqueNames = Object.keys(OFFICIAL_RE_MAGIC_DECK);
    const fetchPromises = uniqueNames.map((name) => fetchCardByName(name));
    const results = await Promise.all(fetchPromises);

    // Build card lookup
    const cardLookup = new Map<string, CardLookupResult>();
    for (let i = 0; i < uniqueNames.length; i++) {
      const result = results[i];
      if (result) {
        cardLookup.set(uniqueNames[i], result);
      }
    }

    if (cardLookup.size === 0) {
      console.warn("No RE magic cards found, using placeholders");
      return generateRealmEaterMagic(30);
    }

    // Build the deck with proper counts
    const cards: CardRef[] = [];
    for (const [cardName, cardCount] of Object.entries(OFFICIAL_RE_MAGIC_DECK)) {
      const card = cardLookup.get(cardName);
      if (card) {
        for (let i = 0; i < cardCount; i++) {
          cards.push({
            cardId: card.cardId,
            variantId: card.variantId,
            name: card.name,
            slug: card.slug,
            type: card.type ?? "Spell",
            subTypes: card.subTypes,
            cost: card.cost,
            attack: card.attack,
            defence: card.defence,
            thresholds: card.thresholds,
            rarity: card.rarity,
          });
        }
      } else {
        console.warn(`RE magic card not found: ${cardName}`);
      }
    }

    // Shuffle the deck
    return shuffleArray(cards);
  } catch (error) {
    console.error("Error fetching RE magic cards:", error);
    return generateRealmEaterMagic(30);
  }
}

// ============================================================================
// Placeholder Generators (fallback when no cards in DB)
// ============================================================================

function generatePlaceholderSites(count: number): CardRef[] {
  const elements = ["air", "water", "earth", "fire"] as const;
  return Array.from({ length: count }, (_, i) => ({
    cardId: 4000 + i,
    name: `${elements[i % 4].charAt(0).toUpperCase() + elements[i % 4].slice(1)} Site ${Math.floor(i / 4) + 1}`,
    type: "Site",
    slug: null,
    thresholds: {
      [elements[i % 4]]: 1,
    },
  }));
}

function generatePlaceholderSpells(count: number): CardRef[] {
  return Array.from({ length: count }, (_, i) => ({
    cardId: 2000 + i,
    name: `Spell ${i + 1}`,
    type: "Spell",
    slug: null,
    cost: Math.floor(i / 8) + 1,
    attack: null,
    defence: null,
  }));
}

function generatePlaceholderAvatars(count: number): CardRef[] {
  const names = ["Warrior", "Mage", "Rogue", "Cleric"];
  return Array.from({ length: count }, (_, i) => ({
    cardId: 1000 + i,
    name: `${names[i % names.length]} Avatar`,
    type: "Avatar",
    slug: null,
  }));
}

function generateRealmEaterMagic(count: number): CardRef[] {
  const spellNames = [
    "Shadow Bolt",
    "Void Blast",
    "Dark Tendrils",
    "Nightmare",
    "Soul Drain",
  ];
  return Array.from({ length: count }, (_, i) => ({
    cardId: 5000 + i,
    name: spellNames[i % spellNames.length],
    type: "Spell",
    slug: null,
    cost: Math.floor(i / 4) + 1,
  }));
}

function generateRealmEaterMinions(count: number): CardRef[] {
  const minionNames = [
    "Shadow Minion",
    "Void Spawn",
    "Dark Crawler",
    "Nightmare Beast",
  ];
  return Array.from({ length: count }, (_, i) => ({
    cardId: 6000 + i,
    name: minionNames[i % minionNames.length],
    type: "Minion",
    slug: null,
    attack: Math.floor(i / 5) + 1,
    defence: Math.floor(i / 5) + 2,
  }));
}

// ============================================================================
// Utilities
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

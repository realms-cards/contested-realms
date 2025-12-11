/**
 * Hotseat game state persistence via IndexedDB
 * Allows players to resume their local game after page reload
 *
 * Uses IndexedDB instead of localStorage to avoid quota issues.
 * IndexedDB has much larger storage limits (50MB+ vs ~5MB for localStorage).
 */

import type { GameState } from "./store/types";

const DB_NAME = "sorcery-hotseat";
const DB_VERSION = 1;
const STORE_NAME = "games";
const GAME_KEY = "current";
const STORAGE_VERSION = 5; // Bumped for permanent owner preservation

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Get or create the IndexedDB database
 */
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

type CompactCardRef = {
  slug: string;
  name?: string;
  cardId?: number;
  instanceId?: string;
  type?: string; // Card type (Site, Minion, Magic, Artifact, Aura, etc.)
};

type CompactZones = {
  hand: CompactCardRef[];
  spellbook: CompactCardRef[];
  atlas: CompactCardRef[];
  graveyard: CompactCardRef[];
  banished: CompactCardRef[];
  collection: CompactCardRef[];
};

type CompactAvatar = {
  slug?: string;
  name?: string;
  cardId?: number;
  pos?: [number, number];
  offset?: [number, number] | null;
  tapped?: boolean;
  counters?: number;
};

type CompactPermanent = {
  slug: string;
  name?: string;
  cardId?: number;
  instanceId?: string;
  type?: string; // Card type (Minion, Magic, Artifact, Aura, etc.)
  owner: 1 | 2; // Owner player number
  tapped?: boolean;
  counters?: number;
  offset?: [number, number];
  attachedTo?: { at: string; index: number };
};

type CompactSite = {
  slug: string;
  name?: string;
  cardId?: number;
  owner: 1 | 2;
};

type CompactPortalPlayerState = {
  rolls: number[];
  tileNumbers: number[];
  rollPhase: "pending" | "rolling" | "complete";
};

type CompactPortalState = {
  harbingerSeats: ("p1" | "p2")[];
  p1: CompactPortalPlayerState | null;
  p2: CompactPortalPlayerState | null;
  currentRoller: "p1" | "p2" | null;
  setupComplete: boolean;
};

type CompactHotseatState = {
  version: number;
  savedAt: number;
  currentPlayer: 1 | 2;
  turn: number;
  phase: string;
  players: GameState["players"];
  zones: { p1: CompactZones; p2: CompactZones };
  avatars: { p1: CompactAvatar; p2: CompactAvatar };
  permanents: Record<string, CompactPermanent[]>;
  boardSites: Record<string, CompactSite>;
  portalState: CompactPortalState | null;
  setupComplete: boolean;
  mulliganComplete: boolean;
  portalSetupComplete: boolean;
};

/**
 * Compact a card to only essential fields
 */
function compactCard(card: unknown): CompactCardRef | null {
  const c = card as {
    slug?: string;
    name?: string;
    cardId?: number;
    instanceId?: string | null;
    type?: string | null;
  } | null;
  if (!c || !c.slug) return null;
  return {
    slug: c.slug,
    name: c.name,
    cardId: c.cardId,
    instanceId: c.instanceId ?? undefined,
    type: c.type ?? undefined,
  };
}

/**
 * Compact an array of cards
 */
function compactCards(cards: unknown[]): CompactCardRef[] {
  return cards
    .map((c) => compactCard(c))
    .filter((c): c is CompactCardRef => c !== null);
}

/**
 * Extract compact game state from the store
 */
function serializeCompact(
  state: GameState
): Omit<
  CompactHotseatState,
  | "version"
  | "savedAt"
  | "setupComplete"
  | "mulliganComplete"
  | "portalSetupComplete"
> {
  const zones = {
    p1: {
      hand: compactCards(state.zones.p1?.hand || []),
      spellbook: compactCards(state.zones.p1?.spellbook || []),
      atlas: compactCards(state.zones.p1?.atlas || []),
      graveyard: compactCards(state.zones.p1?.graveyard || []),
      banished: compactCards(state.zones.p1?.banished || []),
      collection: compactCards(state.zones.p1?.collection || []),
    },
    p2: {
      hand: compactCards(state.zones.p2?.hand || []),
      spellbook: compactCards(state.zones.p2?.spellbook || []),
      atlas: compactCards(state.zones.p2?.atlas || []),
      graveyard: compactCards(state.zones.p2?.graveyard || []),
      banished: compactCards(state.zones.p2?.banished || []),
      collection: compactCards(state.zones.p2?.collection || []),
    },
  };

  const avatars = {
    p1: {
      slug: state.avatars.p1?.card?.slug ?? undefined,
      name: state.avatars.p1?.card?.name,
      cardId: state.avatars.p1?.card?.cardId,
      pos: state.avatars.p1?.pos ?? undefined,
      offset: state.avatars.p1?.offset,
      tapped: state.avatars.p1?.tapped,
      counters: state.avatars.p1?.counters ?? undefined,
    },
    p2: {
      slug: state.avatars.p2?.card?.slug ?? undefined,
      name: state.avatars.p2?.card?.name,
      cardId: state.avatars.p2?.card?.cardId,
      pos: state.avatars.p2?.pos ?? undefined,
      offset: state.avatars.p2?.offset,
      tapped: state.avatars.p2?.tapped,
      counters: state.avatars.p2?.counters ?? undefined,
    },
  };

  const permanents: Record<string, CompactPermanent[]> = {};
  for (const [key, items] of Object.entries(state.permanents)) {
    if (Array.isArray(items) && items.length > 0) {
      permanents[key] = items.map((p) => ({
        slug: p.card?.slug || "",
        name: p.card?.name,
        cardId: p.card?.cardId,
        instanceId: p.instanceId ?? undefined,
        type: p.card?.type ?? undefined,
        owner: p.owner, // Preserve owner for correct assignment on restore
        tapped: p.tapped,
        counters: p.counters ?? undefined,
        offset: p.offset ?? undefined,
        attachedTo: p.attachedTo ?? undefined,
      }));
    }
  }

  const boardSites: Record<string, CompactSite> = {};
  for (const [key, site] of Object.entries(state.board?.sites || {})) {
    if (site && site.card?.slug) {
      boardSites[key] = {
        slug: site.card.slug,
        name: site.card.name,
        cardId: site.card.cardId,
        owner: site.owner,
      };
    }
  }

  // Serialize portal state if present
  let portalState: CompactPortalState | null = null;
  if (state.portalState) {
    portalState = {
      harbingerSeats: state.portalState.harbingerSeats,
      p1: state.portalState.p1,
      p2: state.portalState.p2,
      currentRoller: state.portalState.currentRoller,
      setupComplete: state.portalState.setupComplete,
    };
  }

  return {
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    phase: state.phase,
    players: state.players,
    zones,
    avatars,
    permanents,
    boardSites,
    portalState,
  };
}

/**
 * Save hotseat game state to IndexedDB (async)
 */
export async function saveHotseatGame(
  state: GameState,
  setupComplete: boolean,
  mulliganComplete: boolean,
  portalSetupComplete: boolean
): Promise<boolean> {
  try {
    // Only save if game is in progress (past setup)
    if (!setupComplete || state.phase === "Setup") {
      return false;
    }

    const compact = serializeCompact(state);
    const persisted: CompactHotseatState = {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      ...compact,
      setupComplete,
      mulliganComplete,
      portalSetupComplete,
    };

    // Debug: log the size of what we're saving
    if (process.env.NODE_ENV !== "production") {
      const size = JSON.stringify(persisted).length;
      console.debug(
        `[hotseat] Saving game state: ${(size / 1024).toFixed(1)}KB`
      );
    }

    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(persisted, GAME_KEY);

      request.onsuccess = () => {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[hotseat] Game saved to IndexedDB");
        }
        resolve(true);
      };

      request.onerror = () => {
        console.warn("[hotseat] Failed to save game:", request.error);
        resolve(false);
      };
    });
  } catch (error) {
    console.warn("[hotseat] Failed to save game:", error);
    return false;
  }
}

/**
 * Load hotseat game state from IndexedDB (async)
 */
export async function loadHotseatGame(): Promise<CompactHotseatState | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(GAME_KEY);

      request.onsuccess = () => {
        const persisted = request.result as CompactHotseatState | undefined;
        if (!persisted) {
          resolve(null);
          return;
        }

        // Version check
        if (persisted.version !== STORAGE_VERSION) {
          console.warn("[hotseat] Saved game version mismatch, discarding");
          clearHotseatGame();
          resolve(null);
          return;
        }

        // Staleness check - discard games older than 24 hours
        const maxAge = 24 * 60 * 60 * 1000;
        if (Date.now() - persisted.savedAt > maxAge) {
          console.warn("[hotseat] Saved game too old, discarding");
          clearHotseatGame();
          resolve(null);
          return;
        }

        if (process.env.NODE_ENV !== "production") {
          console.debug("[hotseat] Loaded game from IndexedDB");
        }
        resolve(persisted);
      };

      request.onerror = () => {
        console.warn("[hotseat] Failed to load game:", request.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.warn("[hotseat] Failed to load game:", error);
    return null;
  }
}

/**
 * Clear saved hotseat game from IndexedDB (async)
 */
export async function clearHotseatGame(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(GAME_KEY);

      request.onsuccess = () => {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[hotseat] Cleared saved game from IndexedDB");
        }
        resolve();
      };

      request.onerror = () => {
        console.warn("[hotseat] Failed to clear game:", request.error);
        resolve();
      };
    });
  } catch (error) {
    console.warn("[hotseat] Failed to clear game:", error);
  }
}

/**
 * Check if there's a saved hotseat game (async)
 */
export async function hasSavedHotseatGame(): Promise<boolean> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.count(GAME_KEY);

      request.onsuccess = () => {
        resolve(request.result > 0);
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

/**
 * Apply loaded compact game state to the store
 * This expands the compact format back into full GameState fields
 */
export function applyLoadedGame(
  _state: GameState,
  loaded: CompactHotseatState
): Partial<GameState> {
  // Expand compact card refs back to full format (use type assertion)
  const expandCard = (c: CompactCardRef) => ({
    slug: c.slug,
    name: c.name || "",
    cardId: c.cardId || 0,
    instanceId: c.instanceId,
    type: c.type || null, // Preserve original type for proper rendering
  });

  const expandCards = (cards: CompactCardRef[]) => cards.map(expandCard);

  // Rebuild zones (add battlefield which is required)
  const zones = {
    p1: {
      hand: expandCards(loaded.zones.p1.hand),
      spellbook: expandCards(loaded.zones.p1.spellbook),
      atlas: expandCards(loaded.zones.p1.atlas),
      graveyard: expandCards(loaded.zones.p1.graveyard),
      banished: expandCards(loaded.zones.p1.banished),
      collection: expandCards(loaded.zones.p1.collection),
      battlefield: [],
    },
    p2: {
      hand: expandCards(loaded.zones.p2.hand),
      spellbook: expandCards(loaded.zones.p2.spellbook),
      atlas: expandCards(loaded.zones.p2.atlas),
      graveyard: expandCards(loaded.zones.p2.graveyard),
      banished: expandCards(loaded.zones.p2.banished),
      collection: expandCards(loaded.zones.p2.collection),
      battlefield: [],
    },
  };

  // Rebuild avatars
  const avatars = {
    p1: {
      card: loaded.avatars.p1.slug
        ? {
            slug: loaded.avatars.p1.slug,
            name: loaded.avatars.p1.name || "",
            cardId: loaded.avatars.p1.cardId || 0,
            type: "Avatar" as const,
          }
        : null,
      pos: loaded.avatars.p1.pos || null,
      offset: loaded.avatars.p1.offset || null,
      tapped: loaded.avatars.p1.tapped || false,
      counters: loaded.avatars.p1.counters,
    },
    p2: {
      card: loaded.avatars.p2.slug
        ? {
            slug: loaded.avatars.p2.slug,
            name: loaded.avatars.p2.name || "",
            cardId: loaded.avatars.p2.cardId || 0,
            type: "Avatar" as const,
          }
        : null,
      pos: loaded.avatars.p2.pos || null,
      offset: loaded.avatars.p2.offset || null,
      tapped: loaded.avatars.p2.tapped || false,
      counters: loaded.avatars.p2.counters,
    },
  };

  // Rebuild permanents (use type assertion for complex nested types)
  const permanents: Record<string, unknown[]> = {};
  for (const [key, items] of Object.entries(loaded.permanents)) {
    permanents[key] = items.map((p) => ({
      card: {
        slug: p.slug,
        name: p.name || "",
        cardId: p.cardId || 0,
        instanceId: p.instanceId,
        type: p.type || null, // Preserve original type for proper rendering
      },
      owner: p.owner, // Preserve owner for correct assignment
      instanceId: p.instanceId,
      tapped: p.tapped || false,
      counters: p.counters,
      offset: p.offset || null,
      attachedTo: p.attachedTo || null,
    }));
  }

  // Rebuild board sites
  const sites: Record<string, unknown> = {};
  for (const [key, site] of Object.entries(loaded.boardSites)) {
    sites[key] = {
      card: {
        slug: site.slug,
        name: site.name || "",
        cardId: site.cardId || 0,
        type: "Site",
      },
      owner: site.owner,
    };
  }

  // Rebuild portal state if present
  const portalState = loaded.portalState
    ? {
        harbingerSeats: loaded.portalState.harbingerSeats,
        p1: loaded.portalState.p1,
        p2: loaded.portalState.p2,
        currentRoller: loaded.portalState.currentRoller,
        setupComplete: loaded.portalState.setupComplete,
      }
    : null;

  // Use type assertion for the full return since we're reconstructing from compact format
  return {
    players: loaded.players,
    currentPlayer: loaded.currentPlayer,
    turn: loaded.turn,
    phase: loaded.phase,
    zones,
    selectedCard: null,
    selectedPermanent: null,
    avatars,
    permanents,
    board: {
      size: { w: 5, h: 4 },
      sites,
    },
    portalState,
  } as Partial<GameState>;
}

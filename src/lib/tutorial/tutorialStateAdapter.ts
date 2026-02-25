/**
 * tutorialStateAdapter — Converts tutorial lesson state into the game store format.
 *
 * Handles:
 * - Converting tile numbers (1-20) to CellKey ("x,y") coordinates
 * - Seeding the game store with initial tutorial state
 * - Applying TutorialStatePatch operations to the store
 */

import type {
  TutorialGameState,
  TutorialStatePatch,
} from "./types";
import { tileToCellKey } from "./types";

/** Unique instance ID counter for tutorial cards. */
let instanceCounter = 0;

/** Generate a unique instance ID for a tutorial card. */
function nextInstanceId(): string {
  return `tut_${++instanceCounter}`;
}

/** Reset the instance counter (call when starting a new lesson). */
export function resetInstanceCounter(): void {
  instanceCounter = 0;
}

/**
 * Convert TutorialGameState to a partial game store state object
 * that can be spread into useGameStore.setState().
 */
export function tutorialStateToStore(tutorial: TutorialGameState): Record<string, unknown> {
  // Build board sites (tile number → CellKey)
  const sites: Record<string, { owner: 1 | 2; tapped?: boolean; card?: { cardId: number; name: string; type: string | null; slug?: string | null; thresholds?: Record<string, number> | null } | null }> = {};
  if (tutorial.board?.sites) {
    for (const [tileStr, siteTile] of Object.entries(tutorial.board.sites)) {
      const tile = Number(tileStr);
      const cellKey = tileToCellKey(tile);
      sites[cellKey] = siteTile;
    }
  }

  // Build permanents (tile number → CellKey)
  const permanents: Record<string, Array<{
    owner: 1 | 2;
    card: Record<string, unknown>;
    tapped?: boolean;
    instanceId: string;
    tapVersion?: number;
    version?: number;
    offset?: [number, number] | null;
  }>> = {};
  if (tutorial.permanents) {
    for (const perm of tutorial.permanents) {
      const cellKey = tileToCellKey(perm.tile);
      if (!permanents[cellKey]) {
        permanents[cellKey] = [];
      }
      permanents[cellKey].push({
        owner: perm.owner === "p1" ? 1 : 2,
        card: { ...perm.card, instanceId: nextInstanceId() },
        tapped: perm.tapped ?? false,
        instanceId: nextInstanceId(),
        tapVersion: 0,
        version: 0,
        offset: null,
      });
    }
  }

  // Build player zones with instanceIds
  const addInstances = (cards: Array<Record<string, unknown>>) =>
    cards.map((c) => ({ ...c, instanceId: nextInstanceId() }));

  // Generate placeholder facedown cards for deck piles so they render visibly.
  // In a real game, players have 30+ atlas and 50+ spellbook cards.
  const makeDeckPlaceholders = (count: number, type: "spell" | "site") =>
    Array.from({ length: count }, (_, i) => ({
      cardId: 9000 + i,
      name: type === "site" ? "Unknown Site" : "Unknown Spell",
      type: type === "site" ? "Site" : "Minion",
      instanceId: nextInstanceId(),
    }));

  const p1Hand = addInstances(tutorial.p1.hand ?? []);
  const p2Hand = addInstances(tutorial.p2.hand ?? []);
  const p1SpellbookRaw = addInstances(tutorial.p1.spellbook ?? []);
  const p2SpellbookRaw = addInstances(tutorial.p2.spellbook ?? []);
  const p1AtlasRaw = addInstances(tutorial.p1.atlas ?? []);
  const p2AtlasRaw = addInstances(tutorial.p2.atlas ?? []);
  const p1Graveyard = addInstances(tutorial.p1.graveyard ?? []);
  const p2Graveyard = addInstances(tutorial.p2.graveyard ?? []);

  // Ensure deck piles have enough cards to be visible (minimum 5 per pile).
  // Tutorial lessons often leave these empty since the focus is on the board.
  const MIN_PILE_SIZE = 5;
  const p1Spellbook = p1SpellbookRaw.length >= MIN_PILE_SIZE
    ? p1SpellbookRaw
    : [...p1SpellbookRaw, ...makeDeckPlaceholders(MIN_PILE_SIZE - p1SpellbookRaw.length, "spell")];
  const p2Spellbook = p2SpellbookRaw.length >= MIN_PILE_SIZE
    ? p2SpellbookRaw
    : [...p2SpellbookRaw, ...makeDeckPlaceholders(MIN_PILE_SIZE - p2SpellbookRaw.length, "spell")];
  const p1Atlas = p1AtlasRaw.length >= MIN_PILE_SIZE
    ? p1AtlasRaw
    : [...p1AtlasRaw, ...makeDeckPlaceholders(MIN_PILE_SIZE - p1AtlasRaw.length, "site")];
  const p2Atlas = p2AtlasRaw.length >= MIN_PILE_SIZE
    ? p2AtlasRaw
    : [...p2AtlasRaw, ...makeDeckPlaceholders(MIN_PILE_SIZE - p2AtlasRaw.length, "site")];

  // P1 avatar at tile 18 (center bottom), P2 avatar at tile 3 (center top).
  // In the store coordinate system y increases downward on screen:
  //   y = h-1 = 3 → bottom row (P1 home)
  //   y = 0       → top row    (P2 home)
  // Matches placeAvatarAtStart() in avatarState.ts.
  const p1AvatarPos: [number, number] = [2, 3];
  const p2AvatarPos: [number, number] = [2, 0];

  // Mana offset: tutorial.p1.mana is the total desired mana.
  // The store calculates total mana as: (number of sites owned) + mana offset.
  // So mana offset = desired total - number of sites owned by this player.
  const p1SiteCount = tutorial.board?.sites
    ? Object.values(tutorial.board.sites).filter((s) => s.owner === 1).length
    : 0;
  const p2SiteCount = tutorial.board?.sites
    ? Object.values(tutorial.board.sites).filter((s) => s.owner === 2).length
    : 0;

  const p1ManaOffset = (tutorial.p1.mana ?? 0) - p1SiteCount;
  const p2ManaOffset = (tutorial.p2.life !== undefined ? (tutorial.p2.mana ?? 0) : 0) - p2SiteCount;

  // Build thresholds - fill in zeros for missing elements
  const fullThresholds = (partial?: Partial<Record<string, number>>) => ({
    air: 0,
    water: 0,
    earth: 0,
    fire: 0,
    ...partial,
  });

  return {
    board: {
      size: { w: 5, h: 4 },
      sites,
    },
    permanents,
    players: {
      p1: {
        life: tutorial.p1.life,
        lifeState: tutorial.p1.life <= 0 ? "dd" : "alive",
        mana: p1ManaOffset,
        thresholds: fullThresholds(tutorial.p1.thresholds),
      },
      p2: {
        life: tutorial.p2.life,
        lifeState: tutorial.p2.life <= 0 ? "dd" : "alive",
        mana: p2ManaOffset,
        thresholds: fullThresholds(tutorial.p2.thresholds),
      },
    },
    avatars: {
      p1: {
        card: { ...tutorial.p1.avatar, instanceId: nextInstanceId() },
        pos: p1AvatarPos,
        tapped: false,
        offset: null,
      },
      p2: {
        card: { ...tutorial.p2.avatar, instanceId: nextInstanceId() },
        pos: p2AvatarPos,
        tapped: false,
        offset: null,
      },
    },
    zones: {
      p1: {
        hand: p1Hand,
        spellbook: p1Spellbook,
        atlas: p1Atlas,
        graveyard: p1Graveyard,
        battlefield: [],
        collection: [],
        banished: [],
      },
      p2: {
        hand: p2Hand,
        spellbook: p2Spellbook,
        atlas: p2Atlas,
        graveyard: p2Graveyard,
        battlefield: [],
        collection: [],
        banished: [],
      },
    },
    phase: tutorial.phase ?? "Main",
    currentPlayer: tutorial.currentPlayer === "p2" ? 2 : 1,
    turn: tutorial.turn ?? 1,
    hasDrawnThisTurn: true, // Prevent draw phase prompts in tutorial
  };
}

/**
 * Apply a list of TutorialStatePatch operations to the game store.
 * Returns a partial state object to merge via setState().
 */
export function applyTutorialPatches(
  patches: TutorialStatePatch[],
  currentState: Record<string, unknown>,
): Record<string, unknown> {
  // Deep clone the parts of state we need to mutate
  const state = {
    players: JSON.parse(JSON.stringify(currentState.players)) as Record<string, Record<string, unknown>>,
    board: JSON.parse(JSON.stringify(currentState.board)) as { size: { w: number; h: number }; sites: Record<string, unknown> },
    permanents: JSON.parse(JSON.stringify(currentState.permanents)) as Record<string, Array<Record<string, unknown>>>,
    zones: JSON.parse(JSON.stringify(currentState.zones)) as Record<string, Record<string, Array<Record<string, unknown>>>>,
    phase: currentState.phase as string,
    currentPlayer: currentState.currentPlayer as number,
    turn: currentState.turn as number,
  };

  for (const patch of patches) {
    switch (patch.op) {
      case "set_life": {
        const pk = patch.player;
        if (state.players[pk]) {
          state.players[pk].life = patch.value;
          state.players[pk].lifeState = patch.value <= 0 ? "dd" : "alive";
        }
        break;
      }
      case "set_mana": {
        const pk = patch.player;
        if (state.players[pk]) {
          // Calculate correct mana offset
          const siteCount = Object.values(state.board.sites).filter(
            (s) => (s as { owner: number }).owner === (pk === "p1" ? 1 : 2)
          ).length;
          state.players[pk].mana = patch.value - siteCount;
        }
        break;
      }
      case "set_thresholds": {
        const pk = patch.player;
        if (state.players[pk]) {
          state.players[pk].thresholds = {
            air: 0,
            water: 0,
            earth: 0,
            fire: 0,
            ...patch.value,
          };
        }
        break;
      }
      case "set_phase": {
        state.phase = patch.value;
        break;
      }
      case "set_current_player": {
        state.currentPlayer = patch.value === "p2" ? 2 : 1;
        break;
      }
      case "set_turn": {
        state.turn = patch.value;
        break;
      }
      case "add_card_to_zone": {
        const pk = patch.player;
        const zone = patch.zone;
        if (state.zones[pk]?.[zone]) {
          state.zones[pk][zone].push({ ...patch.card, instanceId: nextInstanceId() });
        }
        break;
      }
      case "remove_card_from_zone": {
        const pk = patch.player;
        const zone = patch.zone;
        if (state.zones[pk]?.[zone]) {
          const idx = state.zones[pk][zone].findIndex(
            (c) => c.name === patch.cardName
          );
          if (idx >= 0) state.zones[pk][zone].splice(idx, 1);
        }
        break;
      }
      case "place_site": {
        const cellKey = tileToCellKey(patch.tile);
        state.board.sites[cellKey] = patch.site;
        break;
      }
      case "remove_site": {
        const cellKey = tileToCellKey(patch.tile);
        delete state.board.sites[cellKey];
        break;
      }
      case "place_permanent": {
        const cellKey = tileToCellKey(patch.permanent.tile);
        if (!state.permanents[cellKey]) {
          state.permanents[cellKey] = [];
        }
        // Idempotent: skip if a permanent with the same name already exists at this cell.
        // This prevents duplication when the game store already processed the action
        // (e.g., during forced_action steps where the player drags a unit).
        const alreadyExists = state.permanents[cellKey].some(
          (p) => (p.card as { name: string }).name === patch.permanent.card.name
        );
        if (!alreadyExists) {
          state.permanents[cellKey].push({
            owner: patch.permanent.owner === "p1" ? 1 : 2,
            card: { ...patch.permanent.card, instanceId: nextInstanceId() },
            tapped: patch.permanent.tapped ?? false,
            instanceId: nextInstanceId(),
            tapVersion: 0,
            version: 0,
            offset: null,
          });
        }
        break;
      }
      case "remove_permanent": {
        const cellKey = tileToCellKey(patch.tile);
        if (state.permanents[cellKey]) {
          const idx = state.permanents[cellKey].findIndex(
            (p) => (p.card as { name: string }).name === patch.cardName
          );
          if (idx >= 0) state.permanents[cellKey].splice(idx, 1);
          if (state.permanents[cellKey].length === 0) {
            delete state.permanents[cellKey];
          }
        }
        break;
      }
      case "deal_damage": {
        const pk = patch.player;
        if (state.players[pk]) {
          const current = state.players[pk].life as number;
          const newLife = Math.max(0, current - patch.amount);
          state.players[pk].life = newLife;
          if (newLife <= 0) state.players[pk].lifeState = "dd";
        }
        break;
      }
      case "tap_permanent": {
        const cellKey = tileToCellKey(patch.tile);
        if (state.permanents[cellKey]) {
          const perm = state.permanents[cellKey].find(
            (p) => (p.card as { name: string }).name === patch.cardName
          );
          if (perm) {
            perm.tapped = true;
            perm.tapVersion = ((perm.tapVersion as number) ?? 0) + 1;
          }
        }
        break;
      }
      case "untap_all": {
        const ownerNum = patch.player === "p1" ? 1 : 2;
        for (const cellKey in state.permanents) {
          for (const perm of state.permanents[cellKey]) {
            if (perm.owner === ownerNum && perm.tapped) {
              perm.tapped = false;
              perm.tapVersion = ((perm.tapVersion as number) ?? 0) + 1;
            }
          }
        }
        break;
      }
    }
  }

  return state;
}

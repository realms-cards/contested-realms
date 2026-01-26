import type { StateCreator } from "zustand";
import type {
  BabelTowerMerge,
  CardRef,
  CellKey,
  GameState,
  PendingBabelPlacement,
  PlayerKey,
  ServerPatchT,
} from "./types";

// Detection functions for Babel cards
export function isApexOfBabel(cardName: string | null | undefined): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase().includes("apex of babel");
}

export function isBaseOfBabel(cardName: string | null | undefined): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase().includes("base of babel");
}

export function isTowerOfBabel(cardName: string | null | undefined): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase().includes("tower of babel");
}

// Check if a site tile has a merged Tower of Babel (Base + Apex stacked)
export function isMergedTower(
  cellKey: CellKey,
  babelTowers: BabelTowerMerge[],
): BabelTowerMerge | null {
  return babelTowers.find((t) => t.cellKey === cellKey) || null;
}

// Unique ID generator for babel placement
function newBabelPlacementId(): string {
  return `babel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type BabelTowerSlice = Pick<
  GameState,
  | "babelTowers"
  | "pendingBabelPlacement"
  | "beginBabelPlacement"
  | "selectBabelTarget"
  | "cancelBabelPlacement"
  | "mergeBabelTower"
  | "destroyBabelTower"
  | "placeApexAsNormalSite"
  | "returnBabelTowerToHand"
>;

export const createBabelTowerSlice: StateCreator<
  GameState,
  [],
  [],
  BabelTowerSlice
> = (set, get) => ({
  babelTowers: [],
  pendingBabelPlacement: null,

  beginBabelPlacement: (input: {
    apex: CardRef;
    casterSeat: PlayerKey;
    handIndex: number;
    validVoidCells: CellKey[];
    validBaseCells: CellKey[];
  }) => {
    const id = newBabelPlacementId();
    const { apex, casterSeat, handIndex, validVoidCells, validBaseCells } =
      input;

    const pending: PendingBabelPlacement = {
      id,
      casterSeat,
      apex,
      handIndex,
      phase: "selectingTarget",
      validVoidCells,
      validBaseCells,
      createdAt: Date.now(),
    };

    set({ pendingBabelPlacement: pending } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] Playing Apex of Babel - select a target`,
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "babelPlacementBegin",
          pending,
        } as never);
      } catch {}
    }
  },

  selectBabelTarget: (targetCell: CellKey, mergeWithBase: boolean) => {
    const state = get();
    const pending = state.pendingBabelPlacement;

    if (!pending || pending.phase !== "selectingTarget") {
      get().log("[BABEL] No pending placement or wrong phase");
      return;
    }

    const { casterSeat, apex, handIndex, validVoidCells, validBaseCells } =
      pending;

    // Validate target
    if (mergeWithBase) {
      if (!validBaseCells.includes(targetCell)) {
        get().log(`[BABEL] Invalid Base of Babel target: ${targetCell}`);
        return;
      }
    } else {
      if (!validVoidCells.includes(targetCell)) {
        get().log(`[BABEL] Invalid void target: ${targetCell}`);
        return;
      }
    }

    // Clear pending state first
    set({ pendingBabelPlacement: null } as Partial<GameState> as GameState);

    if (mergeWithBase) {
      // Merge Apex onto Base to create Tower of Babel
      get().mergeBabelTower(targetCell, apex, casterSeat, handIndex);
    } else {
      // Normal site placement - directly place the Apex as a regular site
      // (Don't call playSelectedTo as it would re-trigger Apex detection)
      get().placeApexAsNormalSite(targetCell, apex, casterSeat, handIndex);
    }

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "babelPlacementResolve",
          targetCell,
          mergeWithBase,
          casterSeat,
        } as never);
      } catch {}
    }
  },

  cancelBabelPlacement: () => {
    const pending = get().pendingBabelPlacement;
    if (!pending) return;

    set({ pendingBabelPlacement: null } as Partial<GameState> as GameState);

    get().log(
      `[${pending.casterSeat.toUpperCase()}] Babel placement cancelled`,
    );

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "babelPlacementCancel",
        } as never);
      } catch {}
    }
  },

  mergeBabelTower: (
    targetCell: CellKey,
    apexCard: CardRef,
    casterSeat: PlayerKey,
    handIndex: number,
  ) => {
    const state = get();
    const board = state.board;
    const zones = state.zones;

    // Get the Base of Babel at target
    const baseTile = board.sites[targetCell];
    if (!baseTile || !isBaseOfBabel(baseTile.card?.name)) {
      get().log("[BABEL] No Base of Babel at target cell");
      return;
    }

    const baseCard = baseTile.card;
    if (!baseCard) return;

    get().pushHistory();

    // Remove Apex from hand
    const hand = [...(zones[casterSeat]?.hand || [])];
    const removedApex = hand.splice(handIndex, 1)[0];
    if (!removedApex) return;

    // Tower of Babel is a CONCEPT - Base stays as site.card, Apex is tracked for stacking
    // Both cards are visually stacked and both go to cemetery on destruction

    // Track the merge - Base remains as site.card, Apex is stored here
    const babelMerge: BabelTowerMerge = {
      cellKey: targetCell,
      baseCard,
      apexCard: removedApex,
      towerCard: null, // No separate tower card - it's a concept
      owner: baseTile.owner,
      createdAt: Date.now(),
    };

    const babelTowersNext = [...state.babelTowers, babelMerge];

    // Update zones
    const zonesNext = {
      ...zones,
      [casterSeat]: {
        ...zones[casterSeat],
        hand,
      },
    };

    // Calculate cell number for logging
    const [x, y] = targetCell.split(",").map(Number);
    const cellNo = y * board.size.w + x + 1;
    const playerNum = casterSeat === "p1" ? "1" : "2";

    get().log(
      `[p${playerNum}:PLAYER] merges [p${playerNum}card:The Apex of Babel] with [p${playerNum}card:The Base of Babel] at #${cellNo} to create [p${playerNum}card:The Tower of Babel]!`,
    );

    // Tap avatar (playing a site)
    const avatars = state.avatars;
    const avatarsNext = avatars[casterSeat]?.tapped
      ? avatars
      : {
          ...avatars,
          [casterSeat]: { ...avatars[casterSeat], tapped: true },
        };

    // Base stays as site.card - only update zones (remove Apex from hand) and track merge
    set({
      zones: zonesNext,
      babelTowers: babelTowersNext,
      avatars: avatarsNext,
      selectedCard: null,
    } as Partial<GameState> as GameState);

    // Send patches - no board change needed, Base stays in place
    const transport = get().transport;
    if (transport) {
      const patch: ServerPatchT = {
        zones: { [casterSeat]: zonesNext[casterSeat] } as GameState["zones"],
        babelTowers: babelTowersNext,
        avatars: {
          [casterSeat]: avatarsNext[casterSeat],
        } as GameState["avatars"],
      };
      get().trySendPatch(patch);
    }

    // Trigger Apex's genesis effect (gain 1 mana this turn since Base was already providing)
    // The Tower now provides 2 mana, and since Base already gave 1, player gains +1 effective
    get().registerGenesisMana(
      targetCell,
      "The Tower of Babel",
      1,
      baseTile.owner,
    );

    // Send toast
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "toast",
          text: `[p${playerNum}:PLAYER] built [p${playerNum}card:The Tower of Babel]!`,
          cellKey: targetCell,
          seat: casterSeat,
        } as never);
      } catch {}
    } else {
      // Offline toast
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: {
                message: `Built The Tower of Babel!`,
                cellKey: targetCell,
              },
            }),
          );
        }
      } catch {}
    }
  },

  destroyBabelTower: (cellKey: CellKey, placeRubble = false) => {
    const state = get();
    const merge = isMergedTower(cellKey, state.babelTowers);

    if (!merge) return false;

    // Both cards go to graveyard
    const ownerSeat: PlayerKey = merge.owner === 1 ? "p1" : "p2";
    const zones = state.zones;
    const graveyard = [...(zones[ownerSeat]?.graveyard || [])];

    // Add both base and apex to graveyard
    graveyard.unshift(merge.apexCard);
    graveyard.unshift(merge.baseCard);

    // Remove from babelTowers tracking
    const babelTowersNext = state.babelTowers.filter(
      (t) => t.cellKey !== cellKey,
    );

    // Remove site from board
    const sitesNext = { ...state.board.sites };
    delete sitesNext[cellKey];

    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        graveyard,
      },
    };

    // Optionally place Rubble token
    let permanentsNext = state.permanents;
    if (placeRubble) {
      const {
        TOKEN_BY_NAME,
        newTokenInstanceId,
        tokenSlug,
      } = require("@/lib/game/tokens");
      const { prepareCardForSeat } = require("./utils/cardHelpers");
      const { newPermanentInstanceId } = require("./utils/idHelpers");
      const { randomTilt } = require("./utils/permanentHelpers");
      const { parseCellKey, getCellNumber } = require("./utils/boardHelpers");

      const rubbleDef = TOKEN_BY_NAME["rubble"];
      if (rubbleDef) {
        const rubbleCard = prepareCardForSeat(
          {
            cardId: newTokenInstanceId(rubbleDef),
            variantId: null,
            name: rubbleDef.name,
            type: "Token",
            slug: tokenSlug(rubbleDef),
            thresholds: null,
          },
          ownerSeat,
        );
        permanentsNext = { ...state.permanents };
        const arr = [...(permanentsNext[cellKey] || [])];
        arr.push({
          owner: merge.owner,
          card: rubbleCard,
          offset: null,
          tilt: randomTilt(),
          tapVersion: 0,
          tapped: false,
          version: 0,
          instanceId: rubbleCard.instanceId ?? newPermanentInstanceId(),
        });
        permanentsNext[cellKey] = arr;
        const [x, y] = parseCellKey(cellKey);
        const playerNum = ownerSeat === "p1" ? "1" : "2";
        get().log(
          `[p${playerNum}:PLAYER] places [p${playerNum}card:Rubble] at #${getCellNumber(x, y, state.board.size.w)}`,
        );
      }
    }

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER]'s [p${playerNum}card:The Tower of Babel] is destroyed - both [p${playerNum}card:The Base of Babel] and [p${playerNum}card:The Apex of Babel] go to cemetery`,
    );

    set({
      board: { ...state.board, sites: sitesNext },
      zones: zonesNext,
      babelTowers: babelTowersNext,
      permanents: permanentsNext,
    } as Partial<GameState> as GameState);

    get().pushHistory();

    // Send patches
    const transport = get().transport;
    if (transport) {
      const patch: ServerPatchT = {
        board: {
          ...state.board,
          sites: { ...sitesNext, [cellKey]: null },
        } as GameState["board"],
        zones: { [ownerSeat]: zonesNext[ownerSeat] } as GameState["zones"],
        babelTowers: babelTowersNext,
        permanents: permanentsNext,
      };
      get().trySendPatch(patch);
    }

    return true;
  },

  placeApexAsNormalSite: (
    targetCell: CellKey,
    apexCard: CardRef,
    casterSeat: PlayerKey,
    handIndex: number,
  ) => {
    const state = get();
    const board = state.board;
    const zones = state.zones;

    // Verify target is empty
    if (board.sites[targetCell]) {
      get().log("[BABEL] Cannot place Apex - target cell is occupied");
      return;
    }

    get().pushHistory();

    // Remove Apex from hand
    const hand = [...(zones[casterSeat]?.hand || [])];
    const removedApex = hand.splice(handIndex, 1)[0];
    if (!removedApex) return;

    // Place Apex as a normal site
    const sitesNext = {
      ...board.sites,
      [targetCell]: {
        owner: casterSeat === "p1" ? 1 : 2,
        tapped: false,
        card: apexCard,
      },
    };

    // Update zones
    const zonesNext = {
      ...zones,
      [casterSeat]: {
        ...zones[casterSeat],
        hand,
      },
    };

    // Calculate cell number for logging
    const [x, y] = targetCell.split(",").map(Number);
    const cellNo = y * board.size.w + x + 1;
    const playerNum = casterSeat === "p1" ? "1" : "2";

    get().log(
      `[p${playerNum}:PLAYER] plays site [p${playerNum}card:${apexCard.name}] at #${cellNo}`,
    );

    // Tap avatar (playing a site)
    const avatars = state.avatars;
    const avatarsNext = avatars[casterSeat]?.tapped
      ? avatars
      : {
          ...avatars,
          [casterSeat]: { ...avatars[casterSeat], tapped: true },
        };

    set({
      board: { ...board, sites: sitesNext },
      zones: zonesNext,
      avatars: avatarsNext,
      selectedCard: null,
    } as Partial<GameState> as GameState);

    // Send patches
    const transport = get().transport;
    if (transport) {
      const patch: ServerPatchT = {
        board: { ...board, sites: sitesNext } as GameState["board"],
        zones: { [casterSeat]: zonesNext[casterSeat] } as GameState["zones"],
        avatars: avatarsNext,
      };
      get().trySendPatch(patch);
    }

    // Trigger site genesis effects if any
    // (Apex of Babel doesn't have a genesis effect when played normally)

    // Send toast
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "toast",
          text: `[p${playerNum}:PLAYER] played [p${playerNum}card:${apexCard.name}] at #${cellNo}`,
          cellKey: targetCell,
          seat: casterSeat,
        } as never);
      } catch {}
    } else {
      // Offline toast
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: {
                message: `Played ${apexCard.name}`,
                cellKey: targetCell,
              },
            }),
          );
        }
      } catch {}
    }
  },

  returnBabelTowerToHand: (cellKey: CellKey) => {
    const state = get();
    const merge = isMergedTower(cellKey, state.babelTowers);

    if (!merge) return;

    get().pushHistory();

    // Both cards go back to hand
    const ownerSeat: PlayerKey = merge.owner === 1 ? "p1" : "p2";
    const zones = state.zones;
    const hand = [...(zones[ownerSeat]?.hand || [])];

    // Add both base and apex back to hand
    hand.push(merge.baseCard);
    hand.push(merge.apexCard);

    // Remove from babelTowers tracking
    const babelTowersNext = state.babelTowers.filter(
      (t) => t.cellKey !== cellKey,
    );

    // Remove site from board
    const sitesNext = { ...state.board.sites };
    delete sitesNext[cellKey];

    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        hand,
      },
    };

    const playerNum = ownerSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER]'s [p${playerNum}card:The Tower of Babel] returned to hand - both [p${playerNum}card:The Base of Babel] and [p${playerNum}card:The Apex of Babel] added to hand`,
    );

    set({
      board: { ...state.board, sites: sitesNext },
      zones: zonesNext,
      babelTowers: babelTowersNext,
    } as Partial<GameState> as GameState);

    // Send patches
    const transport = get().transport;
    if (transport) {
      const patch: ServerPatchT = {
        board: {
          ...state.board,
          sites: { ...sitesNext, [cellKey]: null },
        } as GameState["board"],
        zones: { [ownerSeat]: zonesNext[ownerSeat] } as GameState["zones"],
        babelTowers: babelTowersNext,
      };
      get().trySendPatch(patch);
    }
  },
});

// Helper to create initial empty state
export const createInitialBabelTowers = (): BabelTowerMerge[] => [];

import type { StateCreator } from "zustand";
import { TILE_SIZE } from "@/lib/game/constants";
import type {
  BloomSiteBonus,
  CellKey,
  ElementChoice,
  GameState,
  GemColorId,
  GenesisManaBonus,
  MismanagedMortuaryAura,
  Permanents,
  PlayerKey,
  SpecialSiteState,
  ValleyOfDelightChoice,
} from "./types";
import { parseCellKey, seatFromOwner } from "./utils/boardHelpers";
import { siteHasSilencedToken } from "./utils/resourceHelpers";

// Map element choices to gem colors for visual feedback on Valley of Delight
const ELEMENT_TO_GEM_COLOR: Record<ElementChoice, GemColorId> = {
  air: "cyan",
  water: "blue",
  earth: "green",
  fire: "red",
};

const emptySpecialSiteState = (): SpecialSiteState => ({
  valleyChoices: [],
  bloomBonuses: [],
  genesisMana: [],
  pendingElementChoice: null,
  atlanteanFateAuras: [],
  mismanagedMortuaries: [],
});

// --- Mismanaged Mortuary Detection ---
// Card name matching for Mismanaged Mortuary site
export function isMismanagedMortuary(
  cardName: string | null | undefined,
): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase().includes("mismanaged mortuary");
}

// Generate unique ID for Mismanaged Mortuary aura
function newMortuaryAuraId(): string {
  return `mortuary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const createSpecialSiteSlice: StateCreator<
  GameState,
  [],
  [],
  Pick<
    GameState,
    | "specialSiteState"
    | "triggerElementChoice"
    | "completeElementChoice"
    | "cancelElementChoice"
    | "registerBloomBonus"
    | "registerGenesisMana"
    | "clearTurnBonuses"
    | "removeSiteChoice"
    | "registerMismanagedMortuary"
    | "getEffectiveGraveyardSeat"
  >
> = (set, get) => ({
  specialSiteState: emptySpecialSiteState(),

  triggerElementChoice: (cellKey: CellKey, siteName: string, owner: 1 | 2) => {
    const state = get();
    const chooserSeat: PlayerKey = seatFromOwner(owner);

    set({
      specialSiteState: {
        ...state.specialSiteState,
        pendingElementChoice: {
          cellKey,
          siteName,
          owner,
          chooserSeat,
        },
      },
    });

    state.log(`${siteName} played - choose an element to provide permanently`);
  },

  completeElementChoice: (element: ElementChoice) => {
    const state = get();
    const pending = state.specialSiteState.pendingElementChoice;
    if (!pending) return;

    const newChoice: ValleyOfDelightChoice = {
      cellKey: pending.cellKey,
      element,
      owner: pending.owner,
    };

    const elementName = element.charAt(0).toUpperCase() + element.slice(1);
    state.log(
      `${pending.siteName} now provides ${elementName} threshold permanently`,
    );

    const newState: SpecialSiteState = {
      ...state.specialSiteState,
      valleyChoices: [...state.specialSiteState.valleyChoices, newChoice],
      pendingElementChoice: null,
    };

    set({ specialSiteState: newState });

    // Spawn a gem token on the tile to visualize the element choice
    const gemColor = ELEMENT_TO_GEM_COLOR[element];
    const ownerSeat = pending.chooserSeat;
    const { x, y } = parseCellKey(pending.cellKey);
    const boardSize = state.board.size;

    // Calculate world position from tile coordinates
    // (same formula as Board.tsx uses for tile positioning)
    const offsetX = -((boardSize.w - 1) * TILE_SIZE) / 2;
    const offsetY = -((boardSize.h - 1) * TILE_SIZE) / 2;
    const worldX = x * TILE_SIZE + offsetX;
    const worldZ = y * TILE_SIZE + offsetY;

    // Spawn gem slightly above the card surface
    state.spawnGemTokenAt(gemColor, ownerSeat, {
      x: worldX,
      y: 0.05, // Slightly above board surface
      z: worldZ,
    });

    // Sync to server
    state.trySendPatch({ specialSiteState: newState });
  },

  cancelElementChoice: () => {
    const state = get();
    set({
      specialSiteState: {
        ...state.specialSiteState,
        pendingElementChoice: null,
      },
    });
  },

  registerBloomBonus: (
    cellKey: CellKey,
    siteName: string,
    thresholds: Partial<{
      air: number;
      water: number;
      earth: number;
      fire: number;
    }>,
    owner: 1 | 2,
  ) => {
    const state = get();
    const turn = state.turn;

    const newBonus: BloomSiteBonus = {
      cellKey,
      siteName,
      thresholds,
      turnPlayed: turn,
      owner,
    };

    // Build threshold description
    const elements: string[] = [];
    if (thresholds.air) elements.push("Air");
    if (thresholds.water) elements.push("Water");
    if (thresholds.earth) elements.push("Earth");
    if (thresholds.fire) elements.push("Fire");
    const thresholdDesc = elements.join(", ");

    state.log(
      `${siteName} Genesis: Provides ${thresholdDesc} threshold this turn`,
    );

    const newState: SpecialSiteState = {
      ...state.specialSiteState,
      bloomBonuses: [...state.specialSiteState.bloomBonuses, newBonus],
    };

    set({ specialSiteState: newState });
    state.trySendPatch({ specialSiteState: newState });
  },

  registerGenesisMana: (
    cellKey: CellKey,
    siteName: string,
    amount: number,
    owner: 1 | 2,
  ) => {
    const state = get();
    const turn = state.turn;

    const newBonus: GenesisManaBonus = {
      cellKey,
      siteName,
      manaAmount: amount,
      turnPlayed: turn,
      owner,
    };

    state.log(`${siteName} Genesis: Gain (${amount}) mana this turn`);

    const newState: SpecialSiteState = {
      ...state.specialSiteState,
      genesisMana: [...state.specialSiteState.genesisMana, newBonus],
    };

    set({ specialSiteState: newState });
    state.trySendPatch({ specialSiteState: newState });
  },

  clearTurnBonuses: () => {
    const state = get();

    // Clear ALL temporary bonuses at end of turn
    // (Genesis bloom and genesis mana are "this turn only" effects)
    const hasBloomBonuses = state.specialSiteState.bloomBonuses.length > 0;
    const hasGenesisMana = state.specialSiteState.genesisMana.length > 0;

    if (hasBloomBonuses || hasGenesisMana) {
      const newState: SpecialSiteState = {
        ...state.specialSiteState,
        bloomBonuses: [],
        genesisMana: [],
      };

      set({ specialSiteState: newState });
      state.trySendPatch({ specialSiteState: newState });
    }
  },

  removeSiteChoice: (cellKey: CellKey) => {
    const state = get();
    console.log(
      "[removeSiteChoice] Removing site choice for cellKey:",
      cellKey,
    );
    console.log(
      "[removeSiteChoice] Current mortuaries:",
      state.specialSiteState.mismanagedMortuaries,
    );

    // Check and unregister Garden of Eden if this site was one
    const gardenP1 = state.gardenOfEdenLocations?.p1;
    const gardenP2 = state.gardenOfEdenLocations?.p2;
    if (gardenP1?.cellKey === cellKey) {
      state.unregisterGardenOfEden("p1", cellKey);
    }
    if (gardenP2?.cellKey === cellKey) {
      state.unregisterGardenOfEden("p2", cellKey);
    }

    // Remove valley choice for this cell
    const newValleyChoices = state.specialSiteState.valleyChoices.filter(
      (c) => c.cellKey !== cellKey,
    );

    // Remove any bloom bonuses for this cell
    const newBloomBonuses = state.specialSiteState.bloomBonuses.filter(
      (b) => b.cellKey !== cellKey,
    );

    // Remove any genesis mana for this cell
    const newGenesisMana = state.specialSiteState.genesisMana.filter(
      (b) => b.cellKey !== cellKey,
    );

    // Remove any mismanaged mortuary for this cell
    const newMortuaries = state.specialSiteState.mismanagedMortuaries.filter(
      (m) => m.cellKey !== cellKey,
    );

    // Cancel pending choice if it's for this cell
    const pendingChoice = state.specialSiteState.pendingElementChoice;
    const newPendingChoice =
      pendingChoice?.cellKey === cellKey ? null : pendingChoice;

    const mortuaryChanged =
      newMortuaries.length !==
      state.specialSiteState.mismanagedMortuaries.length;

    if (
      newValleyChoices.length !== state.specialSiteState.valleyChoices.length ||
      newBloomBonuses.length !== state.specialSiteState.bloomBonuses.length ||
      newGenesisMana.length !== state.specialSiteState.genesisMana.length ||
      newPendingChoice !== pendingChoice ||
      mortuaryChanged
    ) {
      const newState: SpecialSiteState = {
        valleyChoices: newValleyChoices,
        bloomBonuses: newBloomBonuses,
        genesisMana: newGenesisMana,
        pendingElementChoice: newPendingChoice,
        atlanteanFateAuras: state.specialSiteState.atlanteanFateAuras,
        mismanagedMortuaries: newMortuaries,
      };

      console.log(
        "[removeSiteChoice] Updating specialSiteState with newMortuaries:",
        newMortuaries,
      );
      set({ specialSiteState: newState });
      console.log("[removeSiteChoice] Sending patch with specialSiteState");
      state.trySendPatch({ specialSiteState: newState });

      // Log mortuary removal
      if (mortuaryChanged) {
        console.log("[removeSiteChoice] Mortuary was removed!");
        state.log(
          "🪦 Mismanaged Mortuary removed - cemeteries return to normal",
        );
      }
    }
  },

  registerMismanagedMortuary: (cellKey: CellKey, owner: 1 | 2) => {
    const state = get();
    const ownerSeat: PlayerKey = seatFromOwner(owner);

    const newAura: MismanagedMortuaryAura = {
      id: newMortuaryAuraId(),
      cellKey,
      owner,
      ownerSeat,
      createdAt: Date.now(),
    };

    const newState: SpecialSiteState = {
      ...state.specialSiteState,
      mismanagedMortuaries: [
        ...state.specialSiteState.mismanagedMortuaries,
        newAura,
      ],
    };

    set({ specialSiteState: newState });
    state.trySendPatch({ specialSiteState: newState });

    const playerNum = owner === 1 ? "1" : "2";
    state.log(
      `🪦 [p${playerNum}:PLAYER] Mismanaged Mortuary: Cemeteries are now swapped!`,
    );

    // Send toast notification to both players
    const tr = state.transport;
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({
          type: "toast",
          text: `🪦 [p${playerNum}:PLAYER] Mismanaged Mortuary: Cemeteries are now swapped!`,
          seat: ownerSeat,
        } as never);
      } catch {}
    } else {
      // Offline: show local toast
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: {
                message: `🪦 Mismanaged Mortuary: Cemeteries are now swapped!`,
              },
            }),
          );
        }
      } catch {}
    }
  },

  getEffectiveGraveyardSeat: (who: PlayerKey): PlayerKey => {
    const state = get();
    const mortuaries = state.specialSiteState.mismanagedMortuaries;

    // Check if there's an active Mismanaged Mortuary for the player
    // If the player controls a Mortuary, their graveyard is swapped with opponent's
    const hasMortuary = mortuaries.some((m) => m.ownerSeat === who);

    if (hasMortuary) {
      // Swap: p1's graveyard becomes p2's, and vice versa
      return who === "p1" ? "p2" : "p1";
    }

    // Also check if opponent controls a Mortuary (they swap too)
    const opponentSeat: PlayerKey = who === "p1" ? "p2" : "p1";
    const opponentHasMortuary = mortuaries.some(
      (m) => m.ownerSeat === opponentSeat,
    );

    if (opponentHasMortuary) {
      // Opponent's mortuary also swaps our perspective
      return opponentSeat;
    }

    return who;
  },
});

// Helper to get empty state for reset
export const getEmptySpecialSiteState = emptySpecialSiteState;

// --- Exported helper for checking cemetery swap ---
// Returns the effective graveyard seat for a given player, accounting for Mismanaged Mortuary.
// This is used by zone operations to route cards to the correct graveyard.
// A silenced Mortuary does NOT apply its swap effect.
export function getEffectiveGraveyardSeatStatic(
  who: PlayerKey,
  mismanagedMortuaries: MismanagedMortuaryAura[],
  permanents?: Permanents,
): PlayerKey {
  // The swap is perspective-based:
  // - If I control a Mortuary, MY cemetery operations go to opponent's cemetery
  // - If opponent controls a Mortuary, THEIR cemetery operations go to my cemetery
  // Both effects can stack if both players control Mortuaries (cancel out)
  // A silenced Mortuary does NOT apply its effect

  // Filter out silenced mortuaries if permanents are provided
  const activeMortuaries = permanents
    ? mismanagedMortuaries.filter(
        (m) => !siteHasSilencedToken(m.cellKey, permanents),
      )
    : mismanagedMortuaries;

  const myMortuary = activeMortuaries.some((m) => m.ownerSeat === who);
  const opponentSeat: PlayerKey = who === "p1" ? "p2" : "p1";
  const oppMortuary = activeMortuaries.some(
    (m) => m.ownerSeat === opponentSeat,
  );

  // XOR logic: if only one player has mortuary, swap happens
  // If both have mortuaries, they cancel out (no swap)
  // If neither has mortuaries, no swap
  if (myMortuary !== oppMortuary) {
    return opponentSeat;
  }

  return who;
}

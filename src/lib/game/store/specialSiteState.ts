import type { StateCreator } from "zustand";
import type {
  BloomSiteBonus,
  CellKey,
  ElementChoice,
  GameState,
  GenesisManaBonus,
  PlayerKey,
  SpecialSiteState,
  ValleyOfDelightChoice,
} from "./types";

const emptySpecialSiteState = (): SpecialSiteState => ({
  valleyChoices: [],
  bloomBonuses: [],
  genesisMana: [],
  pendingElementChoice: null,
});

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
  >
> = (set, get) => ({
  specialSiteState: emptySpecialSiteState(),

  triggerElementChoice: (cellKey: CellKey, siteName: string, owner: 1 | 2) => {
    const state = get();
    const chooserSeat: PlayerKey = owner === 1 ? "p1" : "p2";

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
      `${pending.siteName} now provides ${elementName} threshold permanently`
    );

    const newState: SpecialSiteState = {
      ...state.specialSiteState,
      valleyChoices: [...state.specialSiteState.valleyChoices, newChoice],
      pendingElementChoice: null,
    };

    set({ specialSiteState: newState });

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
    owner: 1 | 2
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
      `${siteName} Genesis: Provides ${thresholdDesc} threshold this turn`
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
    owner: 1 | 2
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

    // Remove valley choice for this cell
    const newValleyChoices = state.specialSiteState.valleyChoices.filter(
      (c) => c.cellKey !== cellKey
    );

    // Remove any bloom bonuses for this cell
    const newBloomBonuses = state.specialSiteState.bloomBonuses.filter(
      (b) => b.cellKey !== cellKey
    );

    // Remove any genesis mana for this cell
    const newGenesisMana = state.specialSiteState.genesisMana.filter(
      (b) => b.cellKey !== cellKey
    );

    // Cancel pending choice if it's for this cell
    const pendingChoice = state.specialSiteState.pendingElementChoice;
    const newPendingChoice =
      pendingChoice?.cellKey === cellKey ? null : pendingChoice;

    if (
      newValleyChoices.length !== state.specialSiteState.valleyChoices.length ||
      newBloomBonuses.length !== state.specialSiteState.bloomBonuses.length ||
      newGenesisMana.length !== state.specialSiteState.genesisMana.length ||
      newPendingChoice !== pendingChoice
    ) {
      const newState: SpecialSiteState = {
        valleyChoices: newValleyChoices,
        bloomBonuses: newBloomBonuses,
        genesisMana: newGenesisMana,
        pendingElementChoice: newPendingChoice,
      };

      set({ specialSiteState: newState });
      state.trySendPatch({ specialSiteState: newState });
    }
  },
});

// Helper to get empty state for reset
export const getEmptySpecialSiteState = emptySpecialSiteState;

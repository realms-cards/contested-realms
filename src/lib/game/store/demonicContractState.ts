import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { seatFromOwner } from "./utils/boardHelpers";
import { getHaystackLimit } from "./utils/boardHelpers";

function newDemonicContractId() {
  return `demonic_contract_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Rarity order for comparison
const RARITY_ORDER: Record<string, number> = {
  ordinary: 1,
  exceptional: 2,
  elite: 3,
  unique: 4,
};

function getRarityLevel(rarity: string): number {
  return RARITY_ORDER[rarity.toLowerCase()] || 0;
}

// Valid sacrifice tokens for Demonic Contract
const VALID_SACRIFICE_TOKENS = [
  "coin",
  "egg",
  "frog",
  "gem",
  "goat",
  "rune",
  "treasure",
  "mortal soul",
];

export type DemonicContractPhase =
  | "choosing_cost" // Choose between life or sacrifice
  | "choosing_sacrifice" // Select token to sacrifice
  | "loading"
  | "selecting"
  | "complete";

export type DemonicContractCostType = "life" | "sacrifice";

export type PendingDemonicContract = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: DemonicContractPhase;
  maxRarity: number; // Highest rarity Demon controlled (limits searchable cards)
  highestDemonName: string | null;
  costType: DemonicContractCostType | null;
  sacrificeOptions: Array<{
    at: CellKey;
    index: number;
    name: string;
    instanceId: string | null;
  }>;
  selectedSacrifice: { at: CellKey; index: number } | null;
  eligibleCards: CardRef[];
  selectedCard: CardRef | null;
  createdAt: number;
};

export type DemonicContractSlice = Pick<
  GameState,
  | "pendingDemonicContract"
  | "beginDemonicContract"
  | "chooseDemonicContractCost"
  | "selectDemonicContractSacrifice"
  | "selectDemonicContractCard"
  | "resolveDemonicContract"
  | "cancelDemonicContract"
>;

export const createDemonicContractSlice: StateCreator<
  GameState,
  [],
  [],
  DemonicContractSlice
> = (set, get) => ({
  pendingDemonicContract: null,

  beginDemonicContract: async (input: {
    spell: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    casterSeat: PlayerKey;
  }) => {
    const id = newDemonicContractId();
    const { spell, casterSeat } = input;
    const permanents = get().permanents;
    const metaByCardId = get().metaByCardId;

    // Find all Demons controlled by the caster and determine highest rarity
    let maxRarity = 0;
    let highestDemonName: string | null = null;

    for (const cellKey of Object.keys(permanents)) {
      const cellPerms = permanents[cellKey as CellKey] || [];
      for (const perm of cellPerms) {
        const ownerSeat = seatFromOwner(perm.owner);
        if (ownerSeat !== casterSeat) continue;

        // Check if it's a Demon
        const meta = metaByCardId[perm.card.cardId];
        const subTypes = (
          meta?.subTypes ||
          perm.card.subTypes ||
          ""
        ).toLowerCase();
        if (subTypes.includes("demon")) {
          const rarity = (meta?.rarity || "").toLowerCase();
          const rarityLevel = getRarityLevel(rarity);
          if (rarityLevel > maxRarity) {
            maxRarity = rarityLevel;
            highestDemonName = perm.card.name;
          }
        }
      }
    }

    if (maxRarity === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Demonic Contract: No Demon minion controlled - cannot cast`
      );
      // Move spell to graveyard
      get().movePermanentToZone(spell.at, spell.index, "graveyard");
      return;
    }

    // Find valid sacrifice tokens on the battlefield
    const sacrificeOptions: Array<{
      at: CellKey;
      index: number;
      name: string;
      instanceId: string | null;
    }> = [];

    for (const cellKey of Object.keys(permanents)) {
      const cellPerms = permanents[cellKey as CellKey] || [];
      cellPerms.forEach((perm, idx) => {
        const ownerSeat = seatFromOwner(perm.owner);
        if (ownerSeat !== casterSeat) return;

        const cardName = (perm.card.name || "").toLowerCase();
        if (VALID_SACRIFICE_TOKENS.some((token) => cardName.includes(token))) {
          sacrificeOptions.push({
            at: cellKey as CellKey,
            index: idx,
            name: perm.card.name,
            instanceId: perm.instanceId ?? null,
          });
        }
      });
    }

    // Set choosing_cost phase
    set({
      pendingDemonicContract: {
        id,
        spell,
        casterSeat,
        phase: "choosing_cost",
        maxRarity,
        highestDemonName,
        costType: null,
        sacrificeOptions,
        selectedSacrifice: null,
        eligibleCards: [],
        selectedCard: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] Demonic Contract: Highest Demon is ${highestDemonName} (${
        Object.entries(RARITY_ORDER).find(([, v]) => v === maxRarity)?.[0] ||
        "unknown"
      } rarity)`
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "demonicContractBegin",
          id,
          spell,
          casterSeat,
          maxRarity,
          highestDemonName,
          sacrificeOptions,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  chooseDemonicContractCost: async (costType: DemonicContractCostType) => {
    const pending = get().pendingDemonicContract;
    if (!pending || pending.phase !== "choosing_cost") return;

    const { casterSeat, sacrificeOptions } = pending;

    if (costType === "sacrifice" && sacrificeOptions.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] No valid sacrifice tokens available`
      );
      return;
    }

    if (costType === "life") {
      // Pay 4 life immediately
      const players = get().players;
      const currentLife = players[casterSeat].life;
      if (currentLife <= 4) {
        get().log(
          `[${casterSeat.toUpperCase()}] Not enough life to pay (need > 4)`
        );
        return;
      }

      // Deduct life
      const playersNext = {
        ...players,
        [casterSeat]: {
          ...players[casterSeat],
          life: currentLife - 4,
        },
      };

      set({
        players: playersNext,
        pendingDemonicContract: {
          ...pending,
          phase: "loading",
          costType: "life",
        },
      } as Partial<GameState> as GameState);

      // Send only affected player's data to avoid overwriting opponent's state
      get().trySendPatch({
        players: {
          [casterSeat]: playersNext[casterSeat],
        } as GameState["players"],
      });
      get().log(
        `[${casterSeat.toUpperCase()}] pays 4 life for Demonic Contract`
      );

      // Proceed to search
      await searchSpellbook();
    } else {
      // Move to sacrifice selection phase
      set({
        pendingDemonicContract: {
          ...pending,
          phase: "choosing_sacrifice",
          costType: "sacrifice",
        },
      } as Partial<GameState> as GameState);
    }

    async function searchSpellbook() {
      const pendingNow = get().pendingDemonicContract;
      if (!pendingNow) return;

      const zones = get().zones;
      const fullSpellbook = zones[casterSeat]?.spellbook || [];

      // Apply Haystack limit if applicable
      const board = get().board;
      const haystackLimit = getHaystackLimit(casterSeat, board.sites || {});
      const spellbook = haystackLimit
        ? fullSpellbook.slice(0, haystackLimit)
        : fullSpellbook;

      // Fetch metadata for all cards
      const cardIds = spellbook.map((c) => c.cardId);
      if (cardIds.length > 0) {
        await get().fetchCardMeta(cardIds);
      }
      const metaByCardId = get().metaByCardId;

      // Filter cards by rarity (must be ≤ maxRarity of Demon controlled)
      const eligibleCards = spellbook.filter((card) => {
        const meta = metaByCardId[card.cardId];
        const cardRarity = (meta?.rarity || "").toLowerCase();
        const cardRarityLevel = getRarityLevel(cardRarity);
        return cardRarityLevel <= pendingNow.maxRarity;
      });

      set({
        pendingDemonicContract: {
          ...pendingNow,
          phase: "selecting",
          eligibleCards,
        },
      } as Partial<GameState> as GameState);

      if (eligibleCards.length === 0) {
        get().log(
          `[${casterSeat.toUpperCase()}] Demonic Contract: No eligible cards found`
        );
      }
    }
  },

  selectDemonicContractSacrifice: async (at: CellKey, index: number) => {
    const pending = get().pendingDemonicContract;
    if (!pending || pending.phase !== "choosing_sacrifice") return;

    const { casterSeat, sacrificeOptions } = pending;

    // Validate sacrifice is in options
    const sacrifice = sacrificeOptions.find(
      (s) => s.at === at && s.index === index
    );
    if (!sacrifice) return;

    // Sacrifice the token (move to banished)
    get().movePermanentToZone(at, index, "banished");

    get().log(
      `[${casterSeat.toUpperCase()}] sacrifices ${
        sacrifice.name
      } for Demonic Contract`
    );

    set({
      pendingDemonicContract: {
        ...pending,
        phase: "loading",
        selectedSacrifice: { at, index },
      },
    } as Partial<GameState> as GameState);

    // Now search spellbook
    const zones = get().zones;
    const fullSpellbook = zones[casterSeat]?.spellbook || [];

    // Apply Haystack limit
    const board = get().board;
    const haystackLimit = getHaystackLimit(casterSeat, board.sites || {});
    const spellbook = haystackLimit
      ? fullSpellbook.slice(0, haystackLimit)
      : fullSpellbook;

    // Fetch metadata
    const cardIds = spellbook.map((c) => c.cardId);
    if (cardIds.length > 0) {
      await get().fetchCardMeta(cardIds);
    }
    const metaByCardId = get().metaByCardId;

    // Filter by rarity
    const eligibleCards = spellbook.filter((card) => {
      const meta = metaByCardId[card.cardId];
      const cardRarity = (meta?.rarity || "").toLowerCase();
      const cardRarityLevel = getRarityLevel(cardRarity);
      return cardRarityLevel <= pending.maxRarity;
    });

    set({
      pendingDemonicContract: {
        ...(get().pendingDemonicContract || pending),
        phase: "selecting",
        eligibleCards,
      },
    } as Partial<GameState> as GameState);
  },

  selectDemonicContractCard: (card: CardRef) => {
    const pending = get().pendingDemonicContract;
    if (!pending || pending.phase !== "selecting") return;

    // Verify card is eligible
    const isEligible = pending.eligibleCards.some(
      (c) => c.cardId === card.cardId
    );
    if (!isEligible) return;

    set({
      pendingDemonicContract: { ...pending, selectedCard: card },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "demonicContractSelect",
          id: pending.id,
          cardName: card.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveDemonicContract: () => {
    const pending = get().pendingDemonicContract;
    if (!pending || pending.phase !== "selecting" || !pending.selectedCard) {
      return;
    }

    const { spell, casterSeat, selectedCard } = pending;

    const zones = get().zones;
    const spellbook = [...(zones[casterSeat]?.spellbook || [])];
    const hand = [...(zones[casterSeat]?.hand || [])];

    // Find and remove selected card from spellbook
    const cardIndex = spellbook.findIndex(
      (c) => c.cardId === selectedCard.cardId
    );
    if (cardIndex === -1) {
      get().log(`[${casterSeat.toUpperCase()}] Card not found in spellbook`);
      return;
    }

    const [drawnCard] = spellbook.splice(cardIndex, 1);
    hand.push(drawnCard);

    // Shuffle spellbook
    for (let i = spellbook.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spellbook[i], spellbook[j]] = [spellbook[j], spellbook[i]];
    }

    const zonesNext = {
      ...zones,
      [casterSeat]: { ...zones[casterSeat], spellbook, hand },
    };

    // Update state
    set({
      zones: zonesNext,
      pendingDemonicContract: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Move spell to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    // Send patches - send full zones for seat to prevent partial patch issues
    const patches: ServerPatchT = {
      zones: {
        [casterSeat]: zonesNext[casterSeat],
      } as unknown as ServerPatchT["zones"],
    };
    get().trySendPatch(patches);

    get().log(
      `[${casterSeat.toUpperCase()}] draws ${
        selectedCard.name
      } via Demonic Contract and shuffles`
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "demonicContractResolve",
          id: pending.id,
          drawnCardName: selectedCard.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingDemonicContract?.id === pending.id) {
          return { ...state, pendingDemonicContract: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelDemonicContract: () => {
    const pending = get().pendingDemonicContract;
    if (!pending) return;

    const { spell, casterSeat } = pending;

    // Move spell to graveyard
    get().movePermanentToZone(spell.at, spell.index, "graveyard");

    set({ pendingDemonicContract: null } as Partial<GameState> as GameState);

    get().log(`[${casterSeat.toUpperCase()}] cancels Demonic Contract`);

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "demonicContractCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});

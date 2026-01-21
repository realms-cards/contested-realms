import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import { isMephistopheles } from "@/lib/game/avatarAbilities";
import type { CardRef, CellKey, GameState, PlayerKey } from "./types";

function newMephistophelesId() {
  return `meph_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * Check if a minion is Evil (Monster, Demon, or Undead subtype)
 * Per rulebook: "Evil" refers to cards with these subtypes
 */
export function isEvilMinion(card: CardRef | null | undefined): boolean {
  if (!card) return false;
  const type = (card.type || "").toLowerCase();
  const subTypes = (card.subTypes || "").toLowerCase();
  if (!type.includes("minion")) return false;
  // Evil subtypes: Monster, Demon, Undead
  return (
    subTypes.includes("monster") ||
    subTypes.includes("demon") ||
    subTypes.includes("undead")
  );
}

export type MephistophelesPhase =
  | "confirming" // User confirms avatar replacement
  | "complete";

export type PendingMephistopheles = {
  id: string;
  spell: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  casterSeat: PlayerKey;
  phase: MephistophelesPhase;
  createdAt: number;
};

export type MephistophelesSlice = Pick<
  GameState,
  | "pendingMephistopheles"
  | "beginMephistopheles"
  | "resolveMephistopheles"
  | "cancelMephistopheles"
  | "mephistophelesSummonUsed"
  | "pendingMephistophelesSummon"
  | "beginMephistophelesSummon"
  | "selectMephistophelesSummonCard"
  | "selectMephistophelesSummonTarget"
  | "cancelMephistophelesSummon"
  | "summonEvilMinionFromHand"
>;

/**
 * Get adjacent cells (orthogonal only - shares a border)
 * Adjacent = card's own square + 4 orthogonal neighbors (up, down, left, right)
 */
function getAdjacentCells(
  x: number,
  y: number,
  boardWidth = 5,
  boardHeight = 4
): CellKey[] {
  const cells: CellKey[] = [];
  // Own square
  cells.push(`${x},${y}` as CellKey);
  // Orthogonal neighbors (shares a border)
  const directions = [
    [0, -1], // up
    [0, 1], // down
    [-1, 0], // left
    [1, 0], // right
  ];
  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < boardWidth && ny >= 0 && ny < boardHeight) {
      cells.push(`${nx},${ny}` as CellKey);
    }
  }
  return cells;
}

/**
 * Check if a minion has Voidwalk ability
 * Note: CardRef doesn't have text, so we check name/subTypes for known Voidwalk minions
 * or look for "voidwalk" in extended card properties if available
 */
function hasVoidwalk(card: CardRef | null | undefined): boolean {
  if (!card) return false;
  // Check for Voidwalk in subTypes (some cards may have it there)
  const subTypes = (card.subTypes || "").toLowerCase();
  if (subTypes.includes("voidwalk")) return true;
  // Check card name for known Voidwalk minions
  const name = (card.name || "").toLowerCase();
  // Known Voidwalk minions can be added here
  const voidwalkMinions = ["voidwalker", "void spirit", "void wraith"];
  return voidwalkMinions.some((v) => name.includes(v));
}

export function createInitialMephistophelesSummonUsed(): Record<
  PlayerKey,
  boolean
> {
  return { p1: false, p2: false };
}

export const createMephistophelesSlice: StateCreator<
  GameState,
  [],
  [],
  MephistophelesSlice
> = (set, get) => ({
  pendingMephistopheles: null,
  mephistophelesSummonUsed: { p1: false, p2: false },
  pendingMephistophelesSummon: null,

  beginMephistopheles: (input) => {
    console.log("[mephistophelesState] beginMephistopheles called:", input);
    const id = newMephistophelesId();
    const casterSeat = input.casterSeat;

    // Mephistopheles can be played anywhere on the board
    // Player will be asked if they want to replace their avatar
    console.log("[mephistophelesState] Setting pendingMephistopheles state");
    set({
      pendingMephistopheles: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "confirming",
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${casterSeat.toUpperCase()}] Mephistopheles enters - confirm to replace your Avatar`
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mephistophelesBegin",
          id,
          spell: input.spell,
          casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveMephistopheles: () => {
    const pending = get().pendingMephistopheles;
    if (!pending || pending.phase !== "confirming") return;

    const { casterSeat, spell } = pending;
    const avatars = get().avatars;
    const originalAvatar = avatars[casterSeat];

    if (!originalAvatar) {
      get().log(
        `[${casterSeat.toUpperCase()}] Cannot resolve: Avatar not found`
      );
      set({ pendingMephistopheles: null } as Partial<GameState> as GameState);
      return;
    }

    // 1. Banish the original avatar to banished zone
    const originalAvatarCard = originalAvatar.card;
    if (originalAvatarCard) {
      const zones = get().zones;
      const banished = [...(zones[casterSeat]?.banished || [])];
      banished.push({
        ...originalAvatarCard,
        instanceId:
          originalAvatarCard.instanceId ||
          `banished_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      });

      const updatedZones = {
        ...zones,
        [casterSeat]: {
          ...zones[casterSeat],
          banished,
        },
      };

      set({
        zones: updatedZones as GameState["zones"],
      } as Partial<GameState> as GameState);
      get().trySendPatch({
        zones: { [casterSeat]: updatedZones[casterSeat] } as GameState["zones"],
      });

      get().log(
        `[${casterSeat.toUpperCase()}] ${originalAvatarCard.name} is banished`
      );
    }

    // 2. Remove Mephistopheles from permanents at that cell
    const permanents = get().permanents;
    const cellPerms = [...(permanents[spell.at] || [])];
    const mephIndex = spell.index;

    if (mephIndex >= 0 && mephIndex < cellPerms.length) {
      const mephPerm = cellPerms[mephIndex];
      const mephCard = mephPerm?.card;

      // Remove from permanents
      cellPerms.splice(mephIndex, 1);
      const updatedPerms = { ...permanents, [spell.at]: cellPerms };

      // 3. Set Mephistopheles as the new avatar
      if (mephCard) {
        const newAvatarState = {
          ...originalAvatar,
          card: {
            ...mephCard,
            // Keep the original card properties but update to avatar role
            type: "Avatar",
          } as CardRef,
          tapped: false,
        };

        const updatedAvatars = {
          ...avatars,
          [casterSeat]: newAvatarState,
        };

        set({
          permanents: updatedPerms,
          avatars: updatedAvatars,
          pendingMephistopheles: null,
        } as Partial<GameState> as GameState);

        get().trySendPatch({
          permanents: updatedPerms,
          avatars: updatedAvatars,
        });

        get().log(
          `[${casterSeat.toUpperCase()}] Mephistopheles becomes your new Avatar!`
        );
      }
    } else {
      set({ pendingMephistopheles: null } as Partial<GameState> as GameState);
    }

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mephistophelesResolve",
          id: pending.id,
          casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelMephistopheles: () => {
    const pending = get().pendingMephistopheles;
    if (!pending) return;

    // Mephistopheles stays on the board as a regular minion (not replacing avatar)
    // The second ability (summoning Evil minions) still works

    get().log(
      `[${pending.casterSeat.toUpperCase()}] Mephistopheles remains as a minion (did not replace Avatar)`
    );

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mephistophelesCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    set({ pendingMephistopheles: null } as Partial<GameState> as GameState);
  },

  summonEvilMinionFromHand: (who, handIndex, targetCell) => {
    const state = get();
    const currentPlayerKey = state.currentPlayer === 1 ? "p1" : "p2";

    // Check if it's the player's turn
    if (who !== currentPlayerKey) {
      get().log(`Cannot summon: Not your turn`);
      return false;
    }

    // Check if already used this turn
    if (state.mephistophelesSummonUsed[who]) {
      get().log(
        `[${who.toUpperCase()}] Already used Mephistopheles summon this turn`
      );
      return false;
    }

    // Check if avatar is Mephistopheles
    const avatar = state.avatars[who];
    if (!isMephistopheles(avatar?.card?.name)) {
      get().log(
        `[${who.toUpperCase()}] Only Mephistopheles can use this ability`
      );
      return false;
    }

    // Get avatar position (pos is [x, y] tuple)
    const avatarPos = avatar?.pos;
    if (!avatarPos) {
      get().log(`[${who.toUpperCase()}] Avatar has no position`);
      return false;
    }

    // Check target is adjacent to avatar (includes avatar's own site)
    const [tx, ty] = targetCell.split(",").map(Number);
    const dx = Math.abs(tx - avatarPos[0]);
    const dy = Math.abs(ty - avatarPos[1]);
    if (dx > 1 || dy > 1) {
      get().log(
        `[${who.toUpperCase()}] Target must be adjacent to your Avatar`
      );
      return false;
    }

    // Check target has a site controlled by the player
    const board = state.board;
    const siteAtTarget = board.sites[targetCell];
    const ownerNum = who === "p1" ? 1 : 2;
    if (!siteAtTarget || siteAtTarget.owner !== ownerNum) {
      get().log(`[${who.toUpperCase()}] Target must be a site you control`);
      return false;
    }

    // Get card from hand
    const zones = state.zones;
    const hand = zones[who]?.hand || [];
    if (handIndex < 0 || handIndex >= hand.length) {
      get().log(`[${who.toUpperCase()}] Invalid card index`);
      return false;
    }

    const card = hand[handIndex];
    if (!isEvilMinion(card)) {
      get().log(`[${who.toUpperCase()}] Can only summon Evil minions`);
      return false;
    }

    // Remove from hand
    const newHand = [...hand];
    newHand.splice(handIndex, 1);

    // Add to permanents at target cell
    const permanents = state.permanents;
    const cellPerms = [...(permanents[targetCell] || [])];
    cellPerms.push({
      owner: ownerNum,
      card: {
        ...card,
        instanceId:
          card.instanceId ||
          `summon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      },
      offset: [0, 0], // Center on tile
      tapped: true, // Summoned minions enter tapped (summoning sickness)
      damage: 0,
    });

    const updatedZones = {
      ...zones,
      [who]: {
        ...zones[who],
        hand: newHand,
      },
    };

    const updatedPerms = { ...permanents, [targetCell]: cellPerms };
    const updatedUsed = { ...state.mephistophelesSummonUsed, [who]: true };

    set({
      zones: updatedZones,
      permanents: updatedPerms,
      mephistophelesSummonUsed: updatedUsed,
    } as Partial<GameState> as GameState);

    get().trySendPatch({
      zones: { [who]: updatedZones[who] } as GameState["zones"],
      permanents: updatedPerms,
      mephistophelesSummonUsed: updatedUsed,
    });

    get().log(
      `[${who.toUpperCase()}] Mephistopheles summons ${
        card.name
      } to the battlefield!`
    );

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mephistophelesSummon",
          who,
          card,
          targetCell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    return true;
  },

  // Interactive summon flow: Begin selecting an Evil minion from hand
  beginMephistophelesSummon: (who) => {
    const state = get();
    const currentPlayerKey = state.currentPlayer === 1 ? "p1" : "p2";

    // Validations
    if (who !== currentPlayerKey) {
      get().log(`Cannot summon: Not your turn`);
      return;
    }

    if (state.mephistophelesSummonUsed[who]) {
      get().log(
        `[${who.toUpperCase()}] Already used Mephistopheles summon this turn`
      );
      return;
    }

    const avatar = state.avatars[who];
    if (!isMephistopheles(avatar?.card?.name)) {
      get().log(
        `[${who.toUpperCase()}] Only Mephistopheles can use this ability`
      );
      return;
    }

    const avatarPos = avatar?.pos;
    if (!avatarPos) {
      get().log(`[${who.toUpperCase()}] Avatar has no position`);
      return;
    }

    // Check if player has any Evil minions in hand
    const hand = state.zones[who]?.hand || [];
    // Debug: log hand contents
    console.log(
      "[mephistophelesState] Hand contents:",
      hand.map((c) => ({
        name: c?.name,
        type: c?.type,
        subTypes: c?.subTypes,
        isEvil: isEvilMinion(c),
      }))
    );
    const evilMinions = hand.filter((card) => isEvilMinion(card));
    console.log(
      "[mephistophelesState] Evil minions found:",
      evilMinions.map((c) => c?.name)
    );
    if (evilMinions.length === 0) {
      get().log(`[${who.toUpperCase()}] No Evil minions in hand to summon`);
      // Send toast notification
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "toast",
            text: `No Evil minions (Monster/Demon/Undead) in hand`,
            seat: who,
          } as never);
        } catch {}
      }
      return;
    }

    const id = newMephistophelesId();
    set({
      pendingMephistophelesSummon: {
        id,
        ownerSeat: who,
        phase: "selectingCard",
        selectedCardIndex: null,
        selectedCard: null,
        validTargets: [],
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${who.toUpperCase()}] Select an Evil minion from your hand to summon`
    );

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mephistophelesSummonBegin",
          id,
          who,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  // Select an Evil minion from hand
  selectMephistophelesSummonCard: (handIndex) => {
    const pending = get().pendingMephistophelesSummon;
    if (!pending || pending.phase !== "selectingCard") return;

    const who = pending.ownerSeat;
    const hand = get().zones[who]?.hand || [];
    const card = hand[handIndex];

    if (!card || !isEvilMinion(card)) {
      get().log(`[${who.toUpperCase()}] Selected card is not an Evil minion`);
      return;
    }

    // Calculate valid target sites
    const avatar = get().avatars[who];
    const avatarPos = avatar?.pos;
    if (!avatarPos) return;

    const adjacentCells = getAdjacentCells(avatarPos[0], avatarPos[1]);
    const board = get().board;
    const ownerNum = who === "p1" ? 1 : 2;
    const cardHasVoidwalk = hasVoidwalk(card);

    // Filter to valid targets: sites you control (including avatar's site), or void for Voidwalk minions
    const validTargets = adjacentCells.filter((cellKey) => {
      const site = board.sites[cellKey];
      if (site && site.owner === ownerNum) {
        // Player controls this site
        return true;
      }
      if (!site && cardHasVoidwalk) {
        // Void tile and minion has Voidwalk
        return true;
      }
      return false;
    });

    if (validTargets.length === 0) {
      get().log(
        `[${who.toUpperCase()}] No valid adjacent sites to summon this minion`
      );
      return;
    }

    set({
      pendingMephistophelesSummon: {
        ...pending,
        phase: "selectingSite",
        selectedCardIndex: handIndex,
        selectedCard: card,
        validTargets,
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${who.toUpperCase()}] Selected ${
        card.name
      } - now choose an adjacent site`
    );

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mephistophelesSummonSelectCard",
          id: pending.id,
          handIndex,
          cardName: card.name,
          validTargets,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  // Select target site and complete the summon
  selectMephistophelesSummonTarget: (targetCell) => {
    const pending = get().pendingMephistophelesSummon;
    if (!pending || pending.phase !== "selectingSite") return;

    const who = pending.ownerSeat;
    const { selectedCardIndex, selectedCard, validTargets } = pending;

    if (selectedCardIndex === null || !selectedCard) return;

    if (!validTargets.includes(targetCell)) {
      get().log(`[${who.toUpperCase()}] Invalid target site`);
      return;
    }

    // Use the legacy summon function to do the actual summoning
    const success = get().summonEvilMinionFromHand(
      who,
      selectedCardIndex,
      targetCell
    );

    if (success) {
      set({
        pendingMephistophelesSummon: null,
      } as Partial<GameState> as GameState);

      // Broadcast
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "mephistophelesSummonComplete",
            id: pending.id,
            targetCell,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }
    }
  },

  // Cancel the summon flow
  cancelMephistophelesSummon: () => {
    const pending = get().pendingMephistophelesSummon;
    if (!pending) return;

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] Cancelled Mephistopheles summon`
    );

    // Broadcast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "mephistophelesSummonCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    set({
      pendingMephistophelesSummon: null,
    } as Partial<GameState> as GameState);
  },
});

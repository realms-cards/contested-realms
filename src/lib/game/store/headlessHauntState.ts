import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CellKey,
  GameState,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { parseCellKey, toCellKey, getCellNumber } from "./utils/boardHelpers";
import {
  movePermanentCore,
  ensurePermanentInstanceId,
} from "./utils/permanentHelpers";

// Card names for detection
const HEADLESS_HAUNT_NAMES = ["headless haunt", "hauntless head"];
const KYTHERA_MECHANISM_NAME = "kythera mechanism";

// Track last trigger to prevent duplicate triggers within the same turn
let lastTriggerTurnNumber = -1;
let lastTriggerSeat: PlayerKey | null = null;

function newHauntMoveId() {
  return `haunt_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Detect if a card is a Headless Haunt or Haunless Head
export function isHeadlessHaunt(cardName: string | undefined | null): boolean {
  if (!cardName) return false;
  const lower = cardName.toLowerCase();
  return HEADLESS_HAUNT_NAMES.some((name) => lower.includes(name));
}

// Detect if Kythera Mechanism is attached to the player's avatar
export function hasKytheraMechanism(
  permanents: GameState["permanents"],
  avatarCellKey: CellKey | null
): boolean {
  if (!avatarCellKey) return false;
  const cellPerms = permanents[avatarCellKey] || [];
  return cellPerms.some((perm) => {
    // attachedTo.index === -1 means attached to avatar
    if (!perm.attachedTo || perm.attachedTo.index !== -1) return false;
    const name = (perm.card?.name || "").toLowerCase();
    return name.includes(KYTHERA_MECHANISM_NAME);
  });
}

// Get all valid tiles on the board (any tile within bounds)
function getAllBoardTiles(boardWidth: number, boardHeight: number): CellKey[] {
  const tiles: CellKey[] = [];
  for (let y = 0; y < boardHeight; y++) {
    for (let x = 0; x < boardWidth; x++) {
      tiles.push(toCellKey(x, y));
    }
  }
  return tiles;
}

// Pick a random tile different from current location
function pickRandomTile(
  currentCell: CellKey,
  boardWidth: number,
  boardHeight: number
): CellKey {
  const allTiles = getAllBoardTiles(boardWidth, boardHeight);
  const otherTiles = allTiles.filter((t) => t !== currentCell);
  if (otherTiles.length === 0) return currentCell;
  const idx = Math.floor(Math.random() * otherTiles.length);
  return otherTiles[idx];
}

export type HeadlessHauntPhase = "pending" | "choosing" | "complete";

export type HeadlessHauntEntry = {
  instanceId: string;
  location: CellKey;
  ownerSeat: PlayerKey;
  cardName: string;
  permanentIndex: number;
};

export type PendingHeadlessHauntMove = {
  id: string;
  ownerSeat: PlayerKey;
  haunts: HeadlessHauntEntry[];
  currentIndex: number; // Which haunt we're processing
  phase: HeadlessHauntPhase;
  hasKythera: boolean; // Whether player has Kythera Mechanism
  selectedTile: CellKey | null; // Player's chosen tile (Kythera only)
  createdAt: number;
};

export type HeadlessHauntSlice = Pick<
  GameState,
  | "headlessHaunts"
  | "pendingHeadlessHauntMove"
  | "registerHeadlessHaunt"
  | "unregisterHeadlessHaunt"
  | "triggerHeadlessHauntStartOfTurn"
  | "selectHeadlessHauntTile"
  | "skipHeadlessHauntMove"
  | "resolveHeadlessHauntMove"
>;

export const createHeadlessHauntSlice: StateCreator<
  GameState,
  [],
  [],
  HeadlessHauntSlice
> = (set, get) => ({
  headlessHaunts: [],
  pendingHeadlessHauntMove: null,

  registerHeadlessHaunt: (entry: {
    instanceId: string;
    location: CellKey;
    ownerSeat: PlayerKey;
    cardName: string;
    permanentIndex: number;
  }) => {
    set((state) => {
      const existing = state.headlessHaunts.find(
        (h) => h.instanceId === entry.instanceId
      );
      if (existing) return state;
      return {
        ...state,
        headlessHaunts: [...state.headlessHaunts, entry],
      } as GameState;
    });
  },

  unregisterHeadlessHaunt: (instanceId: string) => {
    set((state) => ({
      ...state,
      headlessHaunts: state.headlessHaunts.filter(
        (h) => h.instanceId !== instanceId
      ),
    }));
  },

  triggerHeadlessHauntStartOfTurn: (startingPlayerSeat: PlayerKey) => {
    // Guard: skip if resolvers are disabled
    if (get().resolversDisabled) {
      console.log("[HeadlessHaunt] Skipping trigger - resolvers disabled");
      return;
    }

    // Guard: don't trigger if there's already a pending haunt move
    const existingPending = get().pendingHeadlessHauntMove;
    if (existingPending) {
      console.log(
        "[HeadlessHaunt] Skipping trigger - already have pending move:",
        existingPending.id
      );
      return;
    }

    // Guard: prevent duplicate triggers for the same turn
    const currentTurn = get().turn ?? 0;
    if (
      lastTriggerTurnNumber === currentTurn &&
      lastTriggerSeat === startingPlayerSeat
    ) {
      console.log(
        "[HeadlessHaunt] Skipping trigger - already triggered for turn",
        currentTurn,
        startingPlayerSeat
      );
      return;
    }
    // Mark this turn as triggered
    lastTriggerTurnNumber = currentTurn;
    lastTriggerSeat = startingPlayerSeat;

    const actorKey = get().actorKey;
    const permanents = get().permanents;

    // Find all haunts belonging to the starting player that are still on board
    const haunts: HeadlessHauntEntry[] = [];
    for (const [cellKey, cellPerms] of Object.entries(permanents)) {
      if (!cellPerms) continue;
      cellPerms.forEach((perm, idx) => {
        if (!perm || !perm.card) return;
        const ownerSeat = perm.owner === 1 ? "p1" : "p2";
        if (ownerSeat !== startingPlayerSeat) return;
        if (!isHeadlessHaunt(perm.card.name)) return;
        const instanceId = ensurePermanentInstanceId(perm);
        if (!instanceId) return;
        haunts.push({
          instanceId,
          location: cellKey as CellKey,
          ownerSeat,
          cardName: perm.card.name,
          permanentIndex: idx,
        });
      });
    }

    if (haunts.length === 0) return;

    // In online play, only the haunt owner triggers the move
    if (actorKey && actorKey !== startingPlayerSeat) return;

    // Wait for any pending Mother Nature reveals to complete first
    const pendingMotherNature = get().pendingMotherNatureReveal;
    if (pendingMotherNature) {
      setTimeout(() => {
        get().triggerHeadlessHauntStartOfTurn(startingPlayerSeat);
      }, 500);
      return;
    }

    // Check if player has Kythera Mechanism attached to avatar
    const avatar = get().avatars[startingPlayerSeat];
    const avatarCellKey = avatar?.pos
      ? toCellKey(avatar.pos[0], avatar.pos[1])
      : null;
    const hasKythera = hasKytheraMechanism(permanents, avatarCellKey);

    const id = newHauntMoveId();

    if (hasKythera) {
      // With Kythera: show UI for choosing where to move (or skip)
      set({
        pendingHeadlessHauntMove: {
          id,
          ownerSeat: startingPlayerSeat,
          haunts,
          currentIndex: 0,
          phase: "choosing",
          hasKythera: true,
          selectedTile: null,
          createdAt: Date.now(),
        },
      } as Partial<GameState> as GameState);

      get().log(
        `[${startingPlayerSeat.toUpperCase()}] Kythera Mechanism allows choosing haunt movement`
      );

      // Broadcast to opponent
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "headlessHauntBegin",
            id,
            ownerSeat: startingPlayerSeat,
            haunts,
            hasKythera: true,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }
    } else {
      // Without Kythera: show confirmation before random movement
      // Store the pending state for use after confirmation
      set({
        pendingHeadlessHauntMove: {
          id,
          ownerSeat: startingPlayerSeat,
          haunts,
          currentIndex: 0,
          phase: "pending",
          hasKythera: false,
          selectedTile: null,
          createdAt: Date.now(),
        },
      } as Partial<GameState> as GameState);

      // Show confirmation dialog
      const hauntNames = haunts.map((h) => h.cardName).join(", ");
      get().beginAutoResolve({
        kind: "headless_haunt_move",
        ownerSeat: startingPlayerSeat,
        sourceName:
          haunts.length === 1 ? haunts[0].cardName : "Headless Haunts",
        effectDescription: `Move ${haunts.length} haunt${
          haunts.length !== 1 ? "s" : ""
        } to random tile${haunts.length !== 1 ? "s" : ""} (${hauntNames})`,
        callbackData: {
          haunts,
        },
      });
    }
  },

  selectHeadlessHauntTile: (tileKey: CellKey) => {
    const pending = get().pendingHeadlessHauntMove;
    if (!pending || pending.phase !== "choosing" || !pending.hasKythera) return;

    set({
      pendingHeadlessHauntMove: {
        ...pending,
        selectedTile: tileKey,
      },
    } as Partial<GameState> as GameState);
  },

  skipHeadlessHauntMove: () => {
    const pending = get().pendingHeadlessHauntMove;
    if (!pending || pending.phase !== "choosing" || !pending.hasKythera) return;

    const { haunts, currentIndex, ownerSeat, id } = pending;
    const currentHaunt = haunts[currentIndex];

    get().log(
      `[${ownerSeat.toUpperCase()}] chooses not to move ${
        currentHaunt.cardName
      }`
    );

    // Move to next haunt or complete
    const nextIndex = currentIndex + 1;
    if (nextIndex >= haunts.length) {
      // All haunts processed
      set({
        pendingHeadlessHauntMove: { ...pending, phase: "complete" },
      } as Partial<GameState> as GameState);

      // Broadcast skip
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "headlessHauntSkip",
            id,
            hauntIndex: currentIndex,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }

      // Clear after delay
      setTimeout(() => {
        set((state) => {
          if (state.pendingHeadlessHauntMove?.id === id) {
            return { ...state, pendingHeadlessHauntMove: null } as GameState;
          }
          return state;
        });
      }, 500);
    } else {
      // Move to next haunt
      set({
        pendingHeadlessHauntMove: {
          ...pending,
          currentIndex: nextIndex,
          selectedTile: null,
        },
      } as Partial<GameState> as GameState);

      // Broadcast skip
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "headlessHauntSkip",
            id,
            hauntIndex: currentIndex,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }
    }
  },

  resolveHeadlessHauntMove: () => {
    const pending = get().pendingHeadlessHauntMove;
    if (!pending) return;

    const { haunts, currentIndex, ownerSeat, hasKythera, selectedTile, id } =
      pending;
    const boardWidth = get().board.size.w;
    const boardHeight = get().board.size.h;

    // Process each haunt
    let permanents = { ...get().permanents };
    const movedHaunts: Array<{
      cardName: string;
      from: CellKey;
      to: CellKey;
    }> = [];

    if (hasKythera && selectedTile) {
      // Kythera mode: move current haunt to selected tile
      const currentHaunt = haunts[currentIndex];
      const fromKey = currentHaunt.location;
      const toKey = selectedTile;
      let movedPerm: PermanentItem | null = null;

      if (fromKey !== toKey) {
        const arr = permanents[fromKey] || [];
        // Find the permanent by instanceId
        const permIdx = arr.findIndex(
          (p) => ensurePermanentInstanceId(p) === currentHaunt.instanceId
        );
        if (permIdx >= 0) {
          // Get the permanent before moving
          movedPerm = arr[permIdx];

          const result = movePermanentCore(
            permanents,
            fromKey,
            permIdx,
            toKey,
            null
          );
          permanents = result.per;

          movedHaunts.push({
            cardName: currentHaunt.cardName,
            from: fromKey,
            to: toKey,
          });
        }
      }

      // Move to next haunt or complete
      const nextIndex = currentIndex + 1;
      if (nextIndex >= haunts.length) {
        // Apply state changes
        set({
          permanents,
          pendingHeadlessHauntMove: { ...pending, phase: "complete" },
        } as Partial<GameState> as GameState);

        // Send patches
        if (movedHaunts.length > 0 && movedPerm) {
          const move = movedHaunts[0];
          const { x, y } = parseCellKey(move.to);
          const cellNo = getCellNumber(x, y, boardWidth);
          const playerNum = ownerSeat === "p1" ? "1" : "2";
          get().log(
            `[p${playerNum}card:${move.cardName}] moves to #${cellNo} (Kythera Mechanism)`
          );

          // Show toast with cell highlight
          const toastMessage = `[p${playerNum}card:${move.cardName}] moves to #${cellNo}`;
          const toastTr = get().transport;
          if (toastTr?.sendMessage) {
            try {
              toastTr.sendMessage({
                type: "toast",
                text: toastMessage,
                cellKey: move.to,
                seat: ownerSeat,
              } as never);
            } catch {}
          }
          // Always show local toast (online sends to opponent, but we need to see it too)
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage, cellKey: move.to },
              })
            );
          }

          // Send delta patch with explicit __remove for old cell
          const deltaPatch: Record<CellKey, unknown[]> = {
            [move.from]: [
              { instanceId: currentHaunt.instanceId, __remove: true },
            ],
            [move.to]: [movedPerm],
          };
          const patch: ServerPatchT = {
            permanents: deltaPatch as GameState["permanents"],
          };
          get().trySendPatch(patch);
        }

        // Broadcast resolution
        const transport = get().transport;
        if (transport?.sendMessage) {
          try {
            transport.sendMessage({
              type: "headlessHauntResolve",
              id,
              movedHaunts,
              hasKythera: true,
              ts: Date.now(),
            } as unknown as CustomMessage);
          } catch {}
        }

        // Clear after delay
        setTimeout(() => {
          set((state) => {
            if (state.pendingHeadlessHauntMove?.id === id) {
              return { ...state, pendingHeadlessHauntMove: null } as GameState;
            }
            return state;
          });
        }, 1000);
      } else {
        // Apply state changes and move to next haunt
        set({
          permanents,
          pendingHeadlessHauntMove: {
            ...pending,
            currentIndex: nextIndex,
            selectedTile: null,
            phase: "choosing",
          },
        } as Partial<GameState> as GameState);

        // Send patches for this move
        if (movedHaunts.length > 0) {
          const move = movedHaunts[0];
          const { x, y } = parseCellKey(move.to);
          const cellNo = getCellNumber(x, y, boardWidth);
          const playerNum = ownerSeat === "p1" ? "1" : "2";
          get().log(
            `[p${playerNum}card:${move.cardName}] moves to #${cellNo} (Kythera Mechanism)`
          );

          // Show toast with cell highlight
          const toastMessage = `[p${playerNum}card:${move.cardName}] moves to #${cellNo}`;
          const toastTr = get().transport;
          if (toastTr?.sendMessage) {
            try {
              toastTr.sendMessage({
                type: "toast",
                text: toastMessage,
                cellKey: move.to,
                seat: ownerSeat,
              } as never);
            } catch {}
          } else {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("app:toast", {
                  detail: { message: toastMessage, cellKey: move.to },
                })
              );
            }
          }

          const patch: ServerPatchT = {
            permanents: {
              [move.from]: permanents[move.from] || [],
              [move.to]: permanents[move.to] || [],
            },
          };
          get().trySendPatch(patch);
        }

        // Broadcast partial resolution
        const transport = get().transport;
        if (transport?.sendMessage) {
          try {
            transport.sendMessage({
              type: "headlessHauntPartialResolve",
              id,
              hauntIndex: currentIndex,
              movedTo: selectedTile,
              ts: Date.now(),
            } as unknown as CustomMessage);
          } catch {}
        }
      }
    } else {
      // Random mode: move all haunts to random tiles
      // Track moves with instanceIds for delta patch
      const moveDeltas: Array<{
        instanceId: string;
        from: CellKey;
        to: CellKey;
        cardName: string;
        movedPerm: PermanentItem;
      }> = [];

      for (const haunt of haunts) {
        const fromKey = haunt.location;
        const toKey = pickRandomTile(fromKey, boardWidth, boardHeight);

        if (fromKey === toKey) continue;

        const arr = permanents[fromKey] || [];
        const permIdx = arr.findIndex(
          (p) => ensurePermanentInstanceId(p) === haunt.instanceId
        );
        if (permIdx < 0) continue;

        // Get the permanent before moving
        const movedPerm = arr[permIdx];

        const result = movePermanentCore(
          permanents,
          fromKey,
          permIdx,
          toKey,
          null
        );
        permanents = result.per;

        moveDeltas.push({
          instanceId: haunt.instanceId,
          from: fromKey,
          to: toKey,
          cardName: haunt.cardName,
          movedPerm,
        });

        movedHaunts.push({
          cardName: haunt.cardName,
          from: fromKey,
          to: toKey,
        });
      }

      // Apply state changes
      set({
        permanents,
        pendingHeadlessHauntMove: { ...pending, phase: "complete" },
      } as Partial<GameState> as GameState);

      // Log and send patches with toast notification
      const playerNum = ownerSeat === "p1" ? "1" : "2";
      for (const move of movedHaunts) {
        const { x, y } = parseCellKey(move.to);
        const cellNo = getCellNumber(x, y, boardWidth);
        get().log(`[p${playerNum}card:${move.cardName}] wanders to #${cellNo}`);

        // Show toast with cell highlight
        const toastMessage = `[p${playerNum}card:${move.cardName}] wanders to #${cellNo}`;
        const transport = get().transport;
        if (transport?.sendMessage) {
          try {
            transport.sendMessage({
              type: "toast",
              text: toastMessage,
              cellKey: move.to,
              seat: ownerSeat,
            } as never);
          } catch {}
        }
        // Always show local toast (online sends to opponent, but we need to see it too)
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: { message: toastMessage, cellKey: move.to },
            })
          );
        }
      }

      // Send delta patch with explicit __remove for old cells and full permanent for new cells
      // This ensures the merge logic properly removes from old location
      if (moveDeltas.length > 0) {
        const deltaPatch: Record<CellKey, unknown[]> = {};
        for (const delta of moveDeltas) {
          // Add __remove entry for the old cell
          if (!deltaPatch[delta.from]) deltaPatch[delta.from] = [];
          deltaPatch[delta.from].push({
            instanceId: delta.instanceId,
            __remove: true,
          });
          // Add the full permanent to the new cell
          if (!deltaPatch[delta.to]) deltaPatch[delta.to] = [];
          deltaPatch[delta.to].push(delta.movedPerm);
        }
        const patch: ServerPatchT = {
          permanents: deltaPatch as GameState["permanents"],
        };
        get().trySendPatch(patch);
      }

      // Broadcast resolution
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "headlessHauntResolve",
            id,
            movedHaunts,
            hasKythera: false,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }

      // Clear after delay
      setTimeout(() => {
        set((state) => {
          if (state.pendingHeadlessHauntMove?.id === id) {
            return { ...state, pendingHeadlessHauntMove: null } as GameState;
          }
          return state;
        });
      }, 1500);
    }
  },
});

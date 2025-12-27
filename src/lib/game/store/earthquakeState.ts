import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CellKey, GameState, PendingEarthquake } from "./types";
import { toCellKey, getCellNumber } from "./utils/boardHelpers";

function newEarthquakeId() {
  return `eq_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type EarthquakeSlice = Pick<
  GameState,
  | "pendingEarthquake"
  | "beginEarthquake"
  | "selectEarthquakeArea"
  | "performEarthquakeSwap"
  | "resolveEarthquake"
  | "cancelEarthquake"
>;

/**
 * Get all cells in a 2x2 area given the top-left corner
 */
function getAreaCells(
  cornerX: number,
  cornerY: number,
  boardW: number,
  boardH: number
): CellKey[] {
  const cells: CellKey[] = [];
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      const x = cornerX + dx;
      const y = cornerY + dy;
      if (x >= 0 && x < boardW && y >= 0 && y < boardH) {
        cells.push(toCellKey(x, y));
      }
    }
  }
  return cells;
}

/**
 * Check if a position is within the 2x2 area
 */
function isInArea(
  x: number,
  y: number,
  cornerX: number,
  cornerY: number
): boolean {
  return x >= cornerX && x < cornerX + 2 && y >= cornerY && y < cornerY + 2;
}

export const createEarthquakeSlice: StateCreator<
  GameState,
  [],
  [],
  EarthquakeSlice
> = (set, get) => ({
  pendingEarthquake: null,

  beginEarthquake: (input) => {
    const id = newEarthquakeId();
    const casterSeat = input.casterSeat;

    const pending: PendingEarthquake = {
      id,
      spell: input.spell,
      casterSeat,
      phase: "selectingArea",
      areaCorner: null,
      swaps: [],
      affectedCells: [],
      createdAt: Date.now(),
    };

    set({ pendingEarthquake: pending } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "earthquakeBegin",
          id,
          spell: input.spell,
          casterSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log(
      `[p${
        casterSeat === "p1" ? "1" : "2"
      }:PLAYER] casts Earthquake - select a 2×2 area!`
    );
  },

  selectEarthquakeArea: (corner) => {
    const pending = get().pendingEarthquake;
    if (!pending || pending.phase !== "selectingArea") return;

    const board = get().board;
    const { x, y } = corner;

    // Validate corner is valid (allows 2x2 area within board)
    if (x < 0 || y < 0 || x + 1 >= board.size.w || y + 1 >= board.size.h) {
      get().log(`Invalid area corner: #${getCellNumber(x, y, board.size.w)}`);
      return;
    }

    const affectedCells = getAreaCells(x, y, board.size.w, board.size.h);

    set({
      pendingEarthquake: {
        ...pending,
        areaCorner: corner,
        affectedCells,
        phase: "rearranging",
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "earthquakeSelectArea",
          id: pending.id,
          corner,
          affectedCells,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const cellNos = affectedCells
      .map((cell) => {
        const [cx, cy] = cell.split(",").map(Number);
        return `#${getCellNumber(cx, cy, board.size.w)}`;
      })
      .join(", ");
    get().log(`Earthquake area selected: ${cellNos}`);
  },

  performEarthquakeSwap: (from, to) => {
    const pending = get().pendingEarthquake;
    if (!pending || pending.phase !== "rearranging" || !pending.areaCorner)
      return;

    const { areaCorner } = pending;

    // Validate both positions are within the 2x2 area
    if (
      !isInArea(from.x, from.y, areaCorner.x, areaCorner.y) ||
      !isInArea(to.x, to.y, areaCorner.x, areaCorner.y)
    ) {
      get().log("Both swap positions must be within the selected area");
      return;
    }

    // Don't allow swapping same position
    if (from.x === to.x && from.y === to.y) return;

    // Use the existing switchSitePosition function
    get().switchSitePosition(from.x, from.y, to.x, to.y);

    // Record the swap
    const newSwaps = [...pending.swaps, { from, to }];
    set({
      pendingEarthquake: {
        ...pending,
        swaps: newSwaps,
      },
    } as Partial<GameState> as GameState);

    // Broadcast swap
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "earthquakeSwap",
          id: pending.id,
          from,
          to,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const board = get().board;
    const fromNo = getCellNumber(from.x, from.y, board.size.w);
    const toNo = getCellNumber(to.x, to.y, board.size.w);
    get().log(`Earthquake: swapped sites #${fromNo} <-> #${toNo}`);
  },

  resolveEarthquake: () => {
    const pending = get().pendingEarthquake;
    if (
      !pending ||
      (pending.phase !== "rearranging" && pending.phase !== "selectingArea")
    )
      return;

    const permanents = get().permanents;

    // Burrow (tap) all minions and artifacts on the affected cells
    const burrowedItems: Array<{ at: CellKey; index: number; name: string }> =
      [];

    for (const cellKey of pending.affectedCells) {
      const cellPermanents = permanents[cellKey] || [];
      for (let i = 0; i < cellPermanents.length; i++) {
        const perm = cellPermanents[i];
        if (!perm || perm.attachedTo) continue; // Skip attachments

        const type = (perm.card?.type || "").toLowerCase();
        // Only burrow minions and artifacts
        if (type.includes("minion") || type.includes("artifact")) {
          if (!perm.tapped) {
            get().setTapPermanent(cellKey, i, true);
            burrowedItems.push({
              at: cellKey,
              index: i,
              name: perm.card?.name || "Unknown",
            });
          }
        }
      }
    }

    // Move the spell to graveyard
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard"
      );
    } catch {}

    // Log the resolution
    const burrowedList =
      burrowedItems.length > 0
        ? burrowedItems.map((b) => b.name).join(", ")
        : "no units";
    get().log(
      `Earthquake resolved! ${pending.swaps.length} swap${
        pending.swaps.length !== 1 ? "s" : ""
      } performed. Burrowed: ${burrowedList}`
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "earthquakeResolve",
          id: pending.id,
          swaps: pending.swaps,
          burrowedItems,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear the pending state
    set({ pendingEarthquake: null } as Partial<GameState> as GameState);
  },

  cancelEarthquake: () => {
    const pending = get().pendingEarthquake;
    if (!pending) return;

    // Move spell back to hand
    try {
      get().movePermanentToZone(pending.spell.at, pending.spell.index, "hand");
    } catch {}

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "earthquakeCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Earthquake cancelled");
    set({ pendingEarthquake: null } as Partial<GameState> as GameState);
  },
});

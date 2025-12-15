import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { CellKey, ChaosTwisterAccuracy, GameState } from "./types";
import { toCellKey, getCellNumber } from "./utils/boardHelpers";

function newChaosTwisterId() {
  return `ct_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type ChaosTwisterSlice = Pick<
  GameState,
  | "pendingChaosTwister"
  | "beginChaosTwister"
  | "selectChaosTwisterMinion"
  | "selectChaosTwisterSite"
  | "completeChaosTwisterMinigame"
  | "resolveChaosTwister"
  | "cancelChaosTwister"
>;

/**
 * Calculate the landing offset based on minigame accuracy
 * - green: 0 tiles off (exact landing)
 * - yellow: 1 tile off
 * - red: 2 tiles off
 */
function getLandingOffset(accuracy: ChaosTwisterAccuracy): number {
  switch (accuracy) {
    case "green":
      return 0;
    case "yellow":
      return 1;
    case "red":
      return 2;
  }
}

/**
 * Calculate the actual landing site based on target site and offset
 * Picks a random adjacent tile at the given distance
 */
function calculateLandingSite(
  targetX: number,
  targetY: number,
  offset: number,
  boardWidth: number,
  boardHeight: number
): { x: number; y: number; cellKey: CellKey } {
  if (offset === 0) {
    return { x: targetX, y: targetY, cellKey: toCellKey(targetX, targetY) };
  }

  // Get all tiles at the given offset distance (Manhattan distance)
  const candidates: Array<{ x: number; y: number }> = [];

  for (let dx = -offset; dx <= offset; dx++) {
    for (let dy = -offset; dy <= offset; dy++) {
      // Manhattan distance check
      if (Math.abs(dx) + Math.abs(dy) === offset) {
        const nx = targetX + dx;
        const ny = targetY + dy;
        // Check bounds
        if (nx >= 0 && nx < boardWidth && ny >= 0 && ny < boardHeight) {
          candidates.push({ x: nx, y: ny });
        }
      }
    }
  }

  // If no valid candidates, fall back to target
  if (candidates.length === 0) {
    return { x: targetX, y: targetY, cellKey: toCellKey(targetX, targetY) };
  }

  // Pick a random candidate
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return { x: chosen.x, y: chosen.y, cellKey: toCellKey(chosen.x, chosen.y) };
}

export const createChaosTwisterSlice: StateCreator<
  GameState,
  [],
  [],
  ChaosTwisterSlice
> = (set, get) => ({
  pendingChaosTwister: null,

  beginChaosTwister: (input) => {
    const id = newChaosTwisterId();
    const casterSeat = input.casterSeat;

    set({
      pendingChaosTwister: {
        id,
        spell: input.spell,
        casterSeat,
        phase: "selectingMinion",
        targetMinion: null,
        targetSite: null,
        minigameResult: null,
        landingSite: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "chaosTwisterBegin",
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
      }:PLAYER] casts Chaos Twister - select a minion to blow!`
    );
  },

  selectChaosTwisterMinion: (minion) => {
    const pending = get().pendingChaosTwister;
    if (!pending || pending.phase !== "selectingMinion") return;

    set({
      pendingChaosTwister: {
        ...pending,
        targetMinion: minion,
        phase: "selectingSite",
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "chaosTwisterSelectMinion",
          id: pending.id,
          minion,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const cellNo = getCellNumber(
      parseInt(minion.at.split(",")[0]),
      parseInt(minion.at.split(",")[1]),
      get().board.size.w
    );
    get().log(
      `Selected ${minion.card.name} (Power: ${minion.power}) at #${cellNo} - now select a target site!`
    );
  },

  selectChaosTwisterSite: (site) => {
    const pending = get().pendingChaosTwister;
    if (!pending || pending.phase !== "selectingSite") return;

    const cellKey = toCellKey(site.x, site.y);

    set({
      pendingChaosTwister: {
        ...pending,
        targetSite: { x: site.x, y: site.y, cellKey },
        phase: "minigame",
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "chaosTwisterSelectSite",
          id: pending.id,
          site: { x: site.x, y: site.y, cellKey },
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const cellNo = getCellNumber(site.x, site.y, get().board.size.w);
    get().log(`Target site #${cellNo} selected - time for the dexterity test!`);
  },

  completeChaosTwisterMinigame: (result) => {
    const pending = get().pendingChaosTwister;
    if (!pending || pending.phase !== "minigame" || !pending.targetSite) return;

    const offset = getLandingOffset(result.accuracy);
    const board = get().board;
    const landingSite = calculateLandingSite(
      pending.targetSite.x,
      pending.targetSite.y,
      offset,
      board.size.w,
      board.size.h
    );

    const minigameResult = {
      accuracy: result.accuracy,
      hitPosition: result.hitPosition,
      landingOffset: offset,
    };

    set({
      pendingChaosTwister: {
        ...pending,
        minigameResult,
        landingSite,
        phase: "resolving",
      },
    } as Partial<GameState> as GameState);

    // Broadcast result
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "chaosTwisterMinigameResult",
          id: pending.id,
          result: minigameResult,
          landingSite,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    const accuracyLabel =
      result.accuracy === "green"
        ? "PERFECT!"
        : result.accuracy === "yellow"
        ? "Close..."
        : "Missed!";
    const landingCellNo = getCellNumber(
      landingSite.x,
      landingSite.y,
      board.size.w
    );
    get().log(
      `${accuracyLabel} The minion lands at #${landingCellNo} (${offset} tile${
        offset !== 1 ? "s" : ""
      } off)`
    );
  },

  resolveChaosTwister: () => {
    const pending = get().pendingChaosTwister;
    if (
      !pending ||
      pending.phase !== "resolving" ||
      !pending.targetMinion ||
      !pending.landingSite
    )
      return;

    const power = pending.targetMinion.power;
    const landingKey = pending.landingSite.cellKey;
    const permanents = get().permanents;
    const unitsAtLanding = permanents[landingKey] || [];

    // Deal damage equal to minion's power to all units at the landing site
    // (including the minion itself if it lands there)
    const damageRecords: Array<{ at: CellKey; index: number; name: string }> =
      [];

    for (let i = 0; i < unitsAtLanding.length; i++) {
      const unit = unitsAtLanding[i];
      if (!unit || unit.attachedTo) continue; // Skip attachments

      const type = (unit.card?.type || "").toLowerCase();
      // Only damage minions/creatures
      if (type.includes("minion") || type.includes("creature")) {
        damageRecords.push({
          at: landingKey,
          index: i,
          name: unit.card?.name || "Unknown",
        });
        // Apply damage
        get().applyDamageToPermanent(landingKey, i, power);
      }
    }

    // Also damage the blown minion itself (it lands on the site)
    // The minion takes damage from the fall
    get().applyDamageToPermanent(
      pending.targetMinion.at,
      pending.targetMinion.index,
      power
    );

    // Move the spell to graveyard
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard"
      );
    } catch {}

    // Log the resolution
    const landingCellNo = getCellNumber(
      pending.landingSite.x,
      pending.landingSite.y,
      get().board.size.w
    );
    const damageList =
      damageRecords.length > 0
        ? damageRecords.map((d) => d.name).join(", ")
        : "no units";
    get().log(
      `Chaos Twister resolved! ${pending.targetMinion.card.name} deals ${power} damage to ${damageList} at #${landingCellNo}`
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "chaosTwisterResolve",
          id: pending.id,
          power,
          landingSite: pending.landingSite,
          damageRecords,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear the pending state
    set({ pendingChaosTwister: null } as Partial<GameState> as GameState);
  },

  cancelChaosTwister: () => {
    const pending = get().pendingChaosTwister;
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
          type: "chaosTwisterCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    get().log("Chaos Twister cancelled");
    set({ pendingChaosTwister: null } as Partial<GameState> as GameState);
  },
});

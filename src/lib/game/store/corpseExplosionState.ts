import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  CorpseAssignment,
  CorpseExplosionDamageEntry,
  GameState,
  PendingCorpseExplosion,
  PlayerKey,
} from "./types";
import { toCellKey, getCellNumber } from "./utils/boardHelpers";

/**
 * Resolve the attack value for a card, falling back to metaByCardId.
 */
function resolveAttack(card: CardRef, metaByCardId: GameState["metaByCardId"]): number {
  // Try card.attack first
  if (typeof card.attack === "number" && Number.isFinite(card.attack)) {
    return Math.max(0, card.attack);
  }
  // Fall back to metaByCardId
  const meta = metaByCardId[card.cardId];
  if (meta && typeof meta.attack === "number" && Number.isFinite(meta.attack)) {
    return Math.max(0, meta.attack);
  }
  return 0;
}

function newCorpseExplosionId() {
  return `ce_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * Get all cells in a 2x2 area given the top-left corner.
 */
function getAreaCells(
  cornerX: number,
  cornerY: number,
  boardW: number,
  boardH: number,
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

export type CorpseExplosionSlice = Pick<
  GameState,
  | "pendingCorpseExplosion"
  | "beginCorpseExplosion"
  | "selectCorpseExplosionArea"
  | "repickCorpseExplosionArea"
  | "selectCorpse"
  | "assignCorpseToTile"
  | "unassignCorpse"
  | "resolveCorpseExplosion"
  | "dismissCorpseExplosionReport"
  | "cancelCorpseExplosion"
>;

export const createCorpseExplosionSlice: StateCreator<
  GameState,
  [],
  [],
  CorpseExplosionSlice
> = (set, get) => ({
  pendingCorpseExplosion: null,

  beginCorpseExplosion: (input) => {
    const id = newCorpseExplosionId();
    const { spell, casterSeat } = input;
    const zones = get().zones;

    // Gather all minions from both players' graveyards
    const eligibleCorpses: Array<{ card: CardRef; fromSeat: PlayerKey }> = [];
    for (const seat of ["p1", "p2"] as PlayerKey[]) {
      const graveyard = zones[seat]?.graveyard || [];
      for (const card of graveyard) {
        const cardType = (card.type || "").toLowerCase();
        if (cardType.includes("minion")) {
          eligibleCorpses.push({ card, fromSeat: seat });
        }
      }
    }

    if (eligibleCorpses.length === 0) {
      get().log(
        `[${casterSeat.toUpperCase()}] Corpse Explosion: No dead minions in any cemetery`,
      );
      return;
    }

    const pending: PendingCorpseExplosion = {
      id,
      spell,
      casterSeat,
      phase: "selectingArea",
      areaCorner: null,
      affectedCells: [],
      assignments: [],
      eligibleCorpses,
      selectedCorpse: null,
      resolvedReport: null,
      createdAt: Date.now(),
    };

    set({ pendingCorpseExplosion: pending } as Partial<GameState> as GameState);

    // Ensure card metadata (attack values) is fetched for all eligible corpses
    const cardIds = eligibleCorpses
      .map((c) => c.card.cardId)
      .filter((id) => Number.isFinite(id) && id > 0);
    if (cardIds.length > 0) {
      void get().fetchCardMeta(cardIds);
    }

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "corpseExplosionBegin",
          id,
          spell,
          casterSeat,
          eligibleCount: eligibleCorpses.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {
        /* swallow transport errors */
      }
    }

    get().log(
      `[${casterSeat.toUpperCase()}] casts Corpse Explosion — ${eligibleCorpses.length} dead minion(s) available. Select a 2×2 area!`,
    );
  },

  selectCorpseExplosionArea: (corner) => {
    const pending = get().pendingCorpseExplosion;
    if (!pending || pending.phase !== "selectingArea") return;

    const board = get().board;
    const { x, y } = corner;

    // Validate corner allows 2x2 area within board
    if (x < 0 || y < 0 || x + 1 >= board.size.w || y + 1 >= board.size.h) {
      get().log(
        `Invalid area corner: #${getCellNumber(x, y, board.size.w, board.size.h)}`,
      );
      return;
    }

    const affectedCells = getAreaCells(x, y, board.size.w, board.size.h);

    set({
      pendingCorpseExplosion: {
        ...pending,
        areaCorner: corner,
        affectedCells,
        phase: "assigningCorpses",
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "corpseExplosionSelectArea",
          id: pending.id,
          corner,
          affectedCells,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {
        /* swallow transport errors */
      }
    }

    const cellNos = affectedCells
      .map((cell) => {
        const [cx, cy] = cell.split(",").map(Number);
        return `#${getCellNumber(cx, cy, board.size.w, board.size.h)}`;
      })
      .join(", ");
    get().log(`Corpse Explosion area selected: ${cellNos}`);
  },

  repickCorpseExplosionArea: () => {
    const pending = get().pendingCorpseExplosion;
    if (!pending || pending.phase !== "assigningCorpses") return;

    // Re-gather eligible corpses (return all assigned ones back)
    const zones = get().zones;
    const eligibleCorpses: Array<{ card: CardRef; fromSeat: PlayerKey }> = [];
    for (const seat of ["p1", "p2"] as PlayerKey[]) {
      const graveyard = zones[seat]?.graveyard || [];
      for (const card of graveyard) {
        const cardType = (card.type || "").toLowerCase();
        if (cardType.includes("minion")) {
          eligibleCorpses.push({ card, fromSeat: seat });
        }
      }
    }

    set({
      pendingCorpseExplosion: {
        ...pending,
        phase: "selectingArea",
        areaCorner: null,
        affectedCells: [],
        assignments: [],
        eligibleCorpses,
        selectedCorpse: null,
      },
    } as Partial<GameState> as GameState);

    get().log("Corpse Explosion: re-selecting area");
  },

  selectCorpse: (card, fromSeat) => {
    const pending = get().pendingCorpseExplosion;
    if (!pending || pending.phase !== "assigningCorpses") return;

    set({
      pendingCorpseExplosion: {
        ...pending,
        selectedCorpse: { card, fromSeat },
      },
    } as Partial<GameState> as GameState);
  },

  assignCorpseToTile: (cellKey) => {
    const pending = get().pendingCorpseExplosion;
    if (!pending || pending.phase !== "assigningCorpses" || !pending.selectedCorpse)
      return;

    // Check tile is within affected area
    if (!pending.affectedCells.includes(cellKey)) return;

    // Check tile doesn't already have an assignment
    if (pending.assignments.some((a) => a.cellKey === cellKey)) return;

    const { card, fromSeat } = pending.selectedCorpse;
    const power = resolveAttack(card, get().metaByCardId);

    const newAssignment: CorpseAssignment = {
      cellKey,
      corpse: card,
      fromSeat,
      power,
    };

    // Remove corpse from eligible list
    const newEligible = pending.eligibleCorpses.filter(
      (c) =>
        !(
          c.card.instanceId === card.instanceId &&
          c.card.cardId === card.cardId &&
          c.fromSeat === fromSeat
        ),
    );

    set({
      pendingCorpseExplosion: {
        ...pending,
        assignments: [...pending.assignments, newAssignment],
        eligibleCorpses: newEligible,
        selectedCorpse: null,
      },
    } as Partial<GameState> as GameState);

    const board = get().board;
    const [cx, cy] = cellKey.split(",").map(Number);
    const cellNo = getCellNumber(cx, cy, board.size.w, board.size.h);
    get().log(
      `Corpse Explosion: assigned ${card.name} (ATK ${power}) to tile #${cellNo}`,
    );

    // Broadcast assignment
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "corpseExplosionAssign",
          id: pending.id,
          cellKey,
          corpseName: card.name,
          power,
          fromSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {
        /* swallow transport errors */
      }
    }
  },

  unassignCorpse: (cellKey) => {
    const pending = get().pendingCorpseExplosion;
    if (!pending || pending.phase !== "assigningCorpses") return;

    const assignment = pending.assignments.find((a) => a.cellKey === cellKey);
    if (!assignment) return;

    // Return corpse to eligible list
    const newEligible = [
      ...pending.eligibleCorpses,
      { card: assignment.corpse, fromSeat: assignment.fromSeat },
    ];

    set({
      pendingCorpseExplosion: {
        ...pending,
        assignments: pending.assignments.filter((a) => a.cellKey !== cellKey),
        eligibleCorpses: newEligible,
        selectedCorpse: null,
      },
    } as Partial<GameState> as GameState);

    get().log(
      `Corpse Explosion: removed ${assignment.corpse.name} from tile`,
    );
  },

  resolveCorpseExplosion: () => {
    const pending = get().pendingCorpseExplosion;
    if (!pending || pending.phase !== "assigningCorpses") return;

    if (pending.assignments.length === 0) {
      get().log("Corpse Explosion: No corpses assigned — nothing to resolve");
      return;
    }

    // Transition to resolving phase
    set({
      pendingCorpseExplosion: { ...pending, phase: "resolving" },
    } as Partial<GameState> as GameState);

    const permanents = get().permanents;

    // Build damage report and apply damage simultaneously
    const report: CorpseExplosionDamageEntry[] = [];
    for (const assignment of pending.assignments) {
      const cellPerms = permanents[assignment.cellKey] || [];
      const unitsHit: Array<{ name: string; damageTaken: number }> = [];
      for (let i = 0; i < cellPerms.length; i++) {
        const perm = cellPerms[i];
        if (!perm || perm.attachedTo) continue;
        const permType = (perm.card?.type || "").toLowerCase();
        if (permType.includes("minion") || permType.includes("unit")) {
          get().applyDamageToPermanent(
            assignment.cellKey,
            i,
            assignment.power,
          );
          unitsHit.push({
            name: perm.card?.name || "unit",
            damageTaken: assignment.power,
          });
        }
      }
      report.push({
        cellKey: assignment.cellKey,
        corpseName: assignment.corpse.name,
        power: assignment.power,
        unitsHit,
      });
    }

    // Banish the assigned corpses from their source graveyards
    for (const assignment of pending.assignments) {
      const corpseId = assignment.corpse.instanceId;
      if (corpseId) {
        get().moveFromGraveyardToBanished(assignment.fromSeat, corpseId);
      }
    }

    // Move the Corpse Explosion spell to graveyard
    try {
      get().movePermanentToZone(
        pending.spell.at,
        pending.spell.index,
        "graveyard",
      );
    } catch {
      /* spell may already be moved */
    }

    // Log resolution
    const assignmentSummary = pending.assignments
      .map((a) => {
        const board = get().board;
        const [cx, cy] = a.cellKey.split(",").map(Number);
        const cellNo = getCellNumber(cx, cy, board.size.w, board.size.h);
        return `${a.corpse.name} (ATK ${a.power}) → #${cellNo}`;
      })
      .join(", ");
    const damageLog = report
      .flatMap((r) => r.unitsHit.map((u) => `${u.name} takes ${u.damageTaken} dmg`));
    get().log(
      `Corpse Explosion resolved! ${assignmentSummary}. ${damageLog.length > 0 ? damageLog.join("; ") : "No units hit"}. Corpses banished.`,
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "corpseExplosionResolve",
          id: pending.id,
          assignments: pending.assignments.map((a) => ({
            cellKey: a.cellKey,
            corpseName: a.corpse.name,
            power: a.power,
            fromSeat: a.fromSeat,
          })),
          report: report.map((r) => ({
            cellKey: r.cellKey,
            corpseName: r.corpseName,
            power: r.power,
            unitsHit: r.unitsHit,
          })),
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {
        /* swallow transport errors */
      }
    }

    // Transition to "resolved" phase with report (player can dismiss)
    set({
      pendingCorpseExplosion: {
        ...pending,
        phase: "resolved",
        resolvedReport: report,
      },
    } as Partial<GameState> as GameState);
  },

  dismissCorpseExplosionReport: () => {
    set({
      pendingCorpseExplosion: null,
    } as Partial<GameState> as GameState);
  },

  cancelCorpseExplosion: () => {
    const pending = get().pendingCorpseExplosion;
    if (!pending) return;

    // Move spell back to hand
    try {
      get().movePermanentToZone(pending.spell.at, pending.spell.index, "hand");
    } catch {
      /* spell may already be moved */
    }

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "corpseExplosionCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {
        /* swallow transport errors */
      }
    }

    get().log("Corpse Explosion cancelled");
    set({
      pendingCorpseExplosion: null,
    } as Partial<GameState> as GameState);
  },
});

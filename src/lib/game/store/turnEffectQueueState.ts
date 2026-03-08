import type { StateCreator } from "zustand";
import type {
  CellKey,
  GameState,
  PlayerKey,
  TurnEffectEntry,
  TurnEffectKind,
} from "./types";

/**
 * Turn Effect Queue — ordered processing of end-of-turn and start-of-turn effects.
 *
 * When endTurn() fires, the queue is populated by scanning existing card registrations
 * (omphalosHands, lilithMinions, motherNatureMinions, etc.). Effects are processed
 * one at a time. When an effect needs user confirmation (sets pendingAutoResolve or
 * its own pending state), the queue pauses. When the effect completes, it calls
 * resolveCurrentTurnEffect() and the queue advances to the next entry.
 *
 * Sync triggers (Torshammar, clearTurnBonuses) remain inline in endTurn() because
 * they modify permanents that must be in the turn transition patch.
 */

function newQueueEntryId(kind: TurnEffectKind, suffix: string): string {
  return `teq_${kind}_${suffix}_${Math.random().toString(36).slice(2, 6)}`;
}

// Priority constants — lower = processed first
const PRIORITY = {
  omphalos_draw: 0,
  lilith_reveal: 10,
  turn_transition: 15,
  mother_nature_reveal: 20,
  headless_haunt_move: 30,
  goldfish_shuffle: 90,
} as const satisfies Record<TurnEffectKind, number>;

/**
 * Dispatch an effect entry. Returns true if the effect completed synchronously
 * (or had nothing to do), false if waiting for user interaction.
 */
function dispatchEffect(entry: TurnEffectEntry, get: () => GameState): boolean {
  switch (entry.kind) {
    case "omphalos_draw": {
      const omphalosId = entry.data.omphalosId as string;
      const omphalos = get().omphalosHands.find((o) => o.id === omphalosId);
      if (!omphalos) return true; // Omphalos no longer exists

      const spellbook = get().zones[entry.ownerSeat]?.spellbook || [];
      if (spellbook.length === 0) return true; // Nothing to draw

      // In online play, only the owner triggers
      const actorKey = get().actorKey;
      if (actorKey && actorKey !== entry.ownerSeat) return true;

      // Show auto-resolve confirmation for this specific Omphalos
      get().beginAutoResolve({
        kind: "omphalos_draw",
        ownerSeat: entry.ownerSeat,
        sourceName: omphalos.artifact.card.name,
        sourceLocation: omphalos.artifact.at,
        sourceInstanceId: omphalos.artifact.instanceId,
        effectDescription: `Draw a spell from your spellbook into ${omphalos.artifact.card.name}'s hand`,
        callbackData: { omphalosId },
      });
      return false; // Waiting for user confirmation
    }

    case "lilith_reveal": {
      // Delegate to the existing Lilith trigger function
      get().triggerLilithEndOfTurn(entry.ownerSeat);
      // If no auto-resolve was set, Lilith had nothing to do
      return !get().pendingAutoResolve;
    }

    case "turn_transition": {
      get()._executeTurnTransition();
      return true; // Sync — transition completes immediately
    }

    case "mother_nature_reveal": {
      get().triggerMotherNatureStartOfTurn(entry.ownerSeat);
      return !get().pendingMotherNatureReveal;
    }

    case "headless_haunt_move": {
      get().triggerHeadlessHauntStartOfTurn(entry.ownerSeat);
      return (
        !get().pendingHeadlessHauntMove && !get().pendingAutoResolve
      );
    }

    case "goldfish_shuffle": {
      get().triggerGoldfishShuffle(entry.ownerSeat);
      return true; // Sync
    }

    default:
      return true;
  }
}

export type TurnEffectQueueSlice = Pick<
  GameState,
  | "turnEffectQueue"
  | "turnEffectQueueActive"
  | "buildTurnEffectQueue"
  | "processNextTurnEffect"
  | "resolveCurrentTurnEffect"
>;

export const createTurnEffectQueueSlice: StateCreator<
  GameState,
  [],
  [],
  TurnEffectQueueSlice
> = (set, get) => ({
  turnEffectQueue: [],
  turnEffectQueueActive: false,

  buildTurnEffectQueue: (
    endingSeat: PlayerKey,
    startingSeat: PlayerKey,
  ) => {
    const entries: TurnEffectEntry[] = [];
    const state = get();

    // --- EOT effects (for the ending player) ---

    // Omphalos: one entry per instance
    const playerOmphalos = state.omphalosHands.filter(
      (o) => o.ownerSeat === endingSeat,
    );
    for (const omphalos of playerOmphalos) {
      entries.push({
        id: newQueueEntryId("omphalos_draw", omphalos.id),
        kind: "omphalos_draw",
        ownerSeat: endingSeat,
        priority: PRIORITY.omphalos_draw,
        status: "pending",
        sourceName: omphalos.artifact.card.name,
        data: {
          omphalosId: omphalos.id,
          artifactAt: omphalos.artifact.at,
          artifactInstanceId: omphalos.artifact.instanceId,
        },
      });
    }

    // Lilith: one entry per instance
    const playerLiliths = state.lilithMinions.filter(
      (l) => l.ownerSeat === endingSeat,
    );
    for (const lilith of playerLiliths) {
      // Verify still on battlefield
      const cellPerms = state.permanents[lilith.location as CellKey];
      const lilithPerm = cellPerms?.find(
        (p) => p.instanceId === lilith.instanceId,
      );
      if (!lilithPerm) continue;

      entries.push({
        id: newQueueEntryId("lilith_reveal", lilith.instanceId),
        kind: "lilith_reveal",
        ownerSeat: endingSeat,
        priority: PRIORITY.lilith_reveal,
        status: "pending",
        sourceName: lilith.cardName,
        data: {
          lilithInstanceId: lilith.instanceId,
          lilithLocation: lilith.location,
        },
      });
    }

    // --- Turn transition (boundary between EOT and SOT) ---
    entries.push({
      id: newQueueEntryId("turn_transition", `${endingSeat}_${startingSeat}`),
      kind: "turn_transition",
      ownerSeat: endingSeat, // Ending player "owns" the transition
      priority: PRIORITY.turn_transition,
      status: "pending",
      sourceName: "Turn Transition",
      data: { endingSeat, startingSeat },
    });

    // --- SOT effects (for the starting player) ---

    // Mother Nature: one entry per instance
    const motherNatures = (state.motherNatureMinions || []).filter(
      (m) => m.ownerSeat === startingSeat,
    );
    for (const mn of motherNatures) {
      entries.push({
        id: newQueueEntryId("mother_nature_reveal", mn.instanceId),
        kind: "mother_nature_reveal",
        ownerSeat: startingSeat,
        priority: PRIORITY.mother_nature_reveal,
        status: "pending",
        sourceName: mn.cardName,
        data: {
          instanceId: mn.instanceId,
          location: mn.location,
        },
      });
    }

    // Headless Haunt: single entry (the trigger function scans for all haunts)
    // Check if there are any haunts on the board for the starting player
    let hasHaunts = false;
    for (const cellPerms of Object.values(state.permanents)) {
      if (!cellPerms) continue;
      for (const perm of cellPerms) {
        if (!perm?.card) continue;
        const ownerSeat = perm.owner === 1 ? "p1" : "p2";
        if (ownerSeat !== startingSeat) continue;
        const name = (perm.card.name || "").toLowerCase();
        if (
          name.includes("headless haunt") ||
          name.includes("hauntless head")
        ) {
          hasHaunts = true;
          break;
        }
      }
      if (hasHaunts) break;
    }
    if (hasHaunts) {
      entries.push({
        id: newQueueEntryId("headless_haunt_move", startingSeat),
        kind: "headless_haunt_move",
        ownerSeat: startingSeat,
        priority: PRIORITY.headless_haunt_move,
        status: "pending",
        sourceName: "Headless Haunt",
        data: {},
      });
    }

    // Goldfish shuffle (hotseat only)
    if (state.goldfishMode && !state.actorKey) {
      entries.push({
        id: newQueueEntryId("goldfish_shuffle", startingSeat),
        kind: "goldfish_shuffle",
        ownerSeat: startingSeat,
        priority: PRIORITY.goldfish_shuffle,
        status: "pending",
        sourceName: "Goldfish Shuffle",
        data: {},
      });
    }

    // Sort by priority (stable sort)
    entries.sort((a, b) => a.priority - b.priority);

    set({
      turnEffectQueue: entries,
      turnEffectQueueActive: entries.length > 0,
    } as Partial<GameState> as GameState);
  },

  processNextTurnEffect: () => {
    const queue = get().turnEffectQueue;
    if (!get().turnEffectQueueActive) return;

    // Find next pending entry
    const nextIdx = queue.findIndex((e) => e.status === "pending");
    if (nextIdx === -1) {
      // All entries processed — deactivate queue
      set({
        turnEffectQueueActive: false,
      } as Partial<GameState> as GameState);
      return;
    }

    const entry = queue[nextIdx];

    // In online play, skip effects not owned by us (but never skip turn_transition)
    const actorKey = get().actorKey;
    if (actorKey && actorKey !== entry.ownerSeat && entry.kind !== "turn_transition") {
      const updated = queue.map((e, i) =>
        i === nextIdx ? { ...e, status: "skipped" as const } : e,
      );
      set({ turnEffectQueue: updated } as Partial<GameState> as GameState);
      // Continue to next entry
      get().processNextTurnEffect();
      return;
    }

    // Mark as active
    const updated = queue.map((e, i) =>
      i === nextIdx ? { ...e, status: "active" as const } : e,
    );
    set({ turnEffectQueue: updated } as Partial<GameState> as GameState);

    // Dispatch the effect
    try {
      const completedSynchronously = dispatchEffect(entry, get);
      if (completedSynchronously) {
        // Effect had nothing to do or completed inline — advance immediately
        get().resolveCurrentTurnEffect();
      }
      // Otherwise, the effect is waiting for user interaction.
      // The effect's completion handler will call resolveCurrentTurnEffect().
    } catch (err) {
      console.error(
        `[TurnEffectQueue] Error dispatching ${entry.kind}:`,
        err,
      );
      // Mark as complete on error to avoid blocking the queue
      get().resolveCurrentTurnEffect();
    }
  },

  resolveCurrentTurnEffect: () => {
    const queue = get().turnEffectQueue;
    if (!get().turnEffectQueueActive) return;

    // Mark the active entry as complete
    const updated = queue.map((e) =>
      e.status === "active" ? { ...e, status: "complete" as const } : e,
    );
    set({ turnEffectQueue: updated } as Partial<GameState> as GameState);

    // Process next entry after a small delay to avoid deep call stacks
    // and allow React to render intermediate states
    setTimeout(() => {
      get().processNextTurnEffect();
    }, 50);
  },
});

import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PendingAutoResolve,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";

function newAutoResolveId() {
  return `ar_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type AutoResolveSlice = Pick<
  GameState,
  | "pendingAutoResolve"
  | "beginAutoResolve"
  | "confirmAutoResolve"
  | "cancelAutoResolve"
  | "_executeOmphalosDrawEffect"
  | "_executeMorganaGenesisEffect"
  | "_executeHeadlessHauntMoveEffect"
  | "_executePithImpStealEffect"
  | "_executeLilithRevealEffect"
>;

export const createAutoResolveSlice: StateCreator<
  GameState,
  [],
  [],
  AutoResolveSlice
> = (set, get) => ({
  pendingAutoResolve: null,

  beginAutoResolve: (pending: Omit<PendingAutoResolve, "id" | "createdAt">) => {
    const id = newAutoResolveId();
    const actorKey = get().actorKey;

    // Only show confirmation to the owner
    if (actorKey && actorKey !== pending.ownerSeat) {
      // Non-owner just sees a waiting state
      set({
        pendingAutoResolve: {
          ...pending,
          id,
          createdAt: Date.now(),
        },
      } as Partial<GameState> as GameState);
      return;
    }

    set({
      pendingAutoResolve: {
        ...pending,
        id,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] ${pending.sourceName}: ${
        pending.effectDescription
      } - awaiting confirmation`,
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "autoResolveBegin",
          id,
          kind: pending.kind,
          ownerSeat: pending.ownerSeat,
          sourceName: pending.sourceName,
          sourceLocation: pending.sourceLocation,
          sourceInstanceId: pending.sourceInstanceId,
          effectDescription: pending.effectDescription,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  confirmAutoResolve: () => {
    const pending = get().pendingAutoResolve;
    if (!pending) return;

    const { kind, ownerSeat, sourceName, callbackData, id } = pending;

    // Execute the effect based on kind
    switch (kind) {
      case "omphalos_draw": {
        // Execute Omphalos draw effect
        const omphalosId = callbackData.omphalosId as string;
        get()._executeOmphalosDrawEffect(omphalosId, ownerSeat);
        break;
      }
      case "morgana_genesis": {
        // Execute Morgana genesis effect
        const minionData = callbackData.minion as {
          at: string;
          index: number;
          instanceId?: string | null;
          owner: 1 | 2;
          card: unknown;
        };
        get()._executeMorganaGenesisEffect(minionData, ownerSeat);
        break;
      }
      case "headless_haunt_move": {
        // Execute Headless Haunt random move
        get()._executeHeadlessHauntMoveEffect(ownerSeat);
        break;
      }
      case "pith_imp_steal": {
        // Execute Pith Imp steal effect
        const minionData = callbackData.minion as {
          at: string;
          index: number;
          instanceId?: string | null;
          owner: 1 | 2;
          card: unknown;
        };
        get()._executePithImpStealEffect(minionData, ownerSeat);
        break;
      }
      case "lilith_reveal": {
        // Execute Lilith reveal effect
        const lilithInstanceId = callbackData.lilithInstanceId as string;
        const lilithLocation = callbackData.lilithLocation as string;
        get()._executeLilithRevealEffect(
          lilithInstanceId,
          lilithLocation,
          ownerSeat,
        );
        break;
      }
    }

    // Clear pending
    set({ pendingAutoResolve: null } as Partial<GameState> as GameState);

    // Broadcast confirmation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "autoResolveConfirm",
          id,
          kind,
          ownerSeat,
          sourceName,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelAutoResolve: () => {
    const pending = get().pendingAutoResolve;
    if (!pending) return;

    const { kind, ownerSeat, sourceName, id } = pending;

    get().log(
      `[${ownerSeat.toUpperCase()}] ${sourceName}: Effect declined (manual resolution)`,
    );

    // Clear pending
    set({ pendingAutoResolve: null } as Partial<GameState> as GameState);

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "autoResolveCancel",
          id,
          kind,
          ownerSeat,
          sourceName,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  // Internal execution functions - called after user confirms auto-resolve
  _executeOmphalosDrawEffect: (omphalosId: string, ownerSeat: PlayerKey) => {
    // Check Garden of Eden draw limit
    const canDraw = get().canDrawCard(ownerSeat, 1);
    if (!canDraw.allowed) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Garden of Eden prevents Omphalos from drawing (limit: 1 card per turn)`,
      );
      // Show toast notification to the player trying to draw
      const toastMessage =
        "[card:Garden of Eden] blocks cards drawn after the first";
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: {
                message: toastMessage,
                seat: ownerSeat,
                showToSelf: true,
              },
            }),
          );
        }
      } catch {}
      // Also send to opponent via transport
      const toastTr = get().transport;
      if (toastTr?.sendMessage) {
        try {
          toastTr.sendMessage({
            type: "toast",
            text: toastMessage,
            seat: ownerSeat,
          } as never);
        } catch {}
      }
      return;
    }

    const omphalosHands = get().omphalosHands;
    const omphalos = omphalosHands.find((o) => o.id === omphalosId);
    if (!omphalos) return;

    const zones = get().zones;
    const spellbook = [...(zones[ownerSeat]?.spellbook || [])];

    if (spellbook.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] ${
          omphalos.artifact.card.name
        }: No spells in spellbook`,
      );
      return;
    }

    // Draw 1 spell from top
    const drawnCard = spellbook.shift();
    if (!drawnCard) return;

    const zonesNext = {
      ...zones,
      [ownerSeat]: {
        ...zones[ownerSeat],
        spellbook,
      },
    };

    // Add card to Omphalos hand
    const updatedOmphalosHands = omphalosHands.map((o) =>
      o.id === omphalosId ? { ...o, hand: [...o.hand, drawnCard] } : o,
    );

    // Increment cards drawn counter for Garden of Eden tracking
    get().incrementCardsDrawn(ownerSeat, 1);

    set({
      zones: zonesNext,
      omphalosHands: updatedOmphalosHands,
    } as Partial<GameState> as GameState);

    // Send patch
    const zonePatch: ServerPatchT = {
      zones: {
        [ownerSeat]: zonesNext[ownerSeat],
      } as Record<PlayerKey, Zones>,
      omphalosHands: updatedOmphalosHands,
    };
    get().trySendPatch(zonePatch);

    const newHandSize =
      updatedOmphalosHands.find((o) => o.id === omphalosId)?.hand.length || 1;
    get().log(
      `[${ownerSeat.toUpperCase()}] ${
        omphalos.artifact.card.name
      } draws a spell (now has ${newHandSize})`,
    );
  },

  _executeMorganaGenesisEffect: (
    minion: {
      at: string;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: unknown;
      skipConfirmation?: boolean;
    },
    ownerSeat: PlayerKey,
  ) => {
    // Delegate to triggerMorganaGenesis with skipConfirmation
    get().triggerMorganaGenesis({
      minion: {
        at: minion.at as CellKey,
        index: minion.index,
        instanceId: minion.instanceId,
        owner: minion.owner,
        card: minion.card as CardRef,
      },
      ownerSeat,
      skipConfirmation: true, // Skip confirmation since user already confirmed
    });
  },

  _executeHeadlessHauntMoveEffect: (_ownerSeat: PlayerKey) => {
    // The actual move logic is already in resolveHeadlessHauntMove
    // Just call it after setting up pending state
    get().resolveHeadlessHauntMove();
  },

  _executePithImpStealEffect: (
    minion: {
      at: string;
      index: number;
      instanceId?: string | null;
      owner: 1 | 2;
      card: unknown;
      skipConfirmation?: boolean;
    },
    ownerSeat: PlayerKey,
  ) => {
    // Delegate to the actual steal logic with skipConfirmation
    get().triggerPithImpGenesis({
      minion: {
        at: minion.at as CellKey,
        index: minion.index,
        instanceId: minion.instanceId,
        owner: minion.owner,
        card: minion.card as CardRef,
      },
      ownerSeat,
      skipConfirmation: true, // Skip confirmation since user already confirmed
    });
  },

  _executeLilithRevealEffect: (
    _lilithInstanceId: string,
    _lilithLocation: string,
    ownerSeat: PlayerKey,
  ) => {
    // Call triggerLilithEndOfTurn with skipConfirmation to proceed with the reveal
    get().triggerLilithEndOfTurn(ownerSeat, true);
  },
});

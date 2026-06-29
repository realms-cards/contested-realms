import type { StateCreator } from "zustand";
import { TILE_SIZE } from "@/lib/game/constants";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PendingAutoResolve,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
  Zones,
} from "./types";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { randomTilt } from "./utils/permanentHelpers";

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
  | "_executeTadpolePoolGenesis"
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
        // Execute Omphalos draw effect (queue handles per-instance sequencing)
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
      case "tadpole_pool_genesis": {
        // Summon three submerged Frog tokens at the Tadpole Pool's cell
        const cellKey = callbackData.cellKey as CellKey;
        get()._executeTadpolePoolGenesis(cellKey, ownerSeat);
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

    // Signal turn effect queue for effects fully done after confirmation.
    // - omphalos_draw: signals from closeRevealOverlay (after card reveal is dismissed)
    // - lilith_reveal, headless_haunt_move: signal from their own resolution handlers
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

    // Signal turn effect queue: cancellation always completes the current entry
    if (get().turnEffectQueueActive) {
      get().resolveCurrentTurnEffect();
    }
  },

  // Internal execution functions - called after user confirms auto-resolve
  _executeOmphalosDrawEffect: (omphalosId: string, ownerSeat: PlayerKey) => {
    // Check Garden of Eden draw limit
    const canDraw = get().canDrawCard(ownerSeat, 1);
    if (!canDraw.allowed) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Garden of Eden prevents Omphalos from drawing (limit: 1 spell per turn)`,
      );
      // Show toast notification to the player trying to draw
      const toastMessage =
        "[card:Garden of Eden] blocks spell draws after the first";
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

    // Only send the spellbook change for this seat — zone-property-level
    // merge in applyServerPatch preserves atlas/hand/graveyard from state.
    const zonePatch: ServerPatchT = {
      zones: {
        [ownerSeat]: { spellbook },
      } as unknown as Record<PlayerKey, Zones>,
      omphalosHands: updatedOmphalosHands,
    };
    get().trySendPatch(zonePatch);

    const newHandSize =
      updatedOmphalosHands.find((o) => o.id === omphalosId)?.hand.length || 1;

    // Public log (both players see this — don't reveal the card name)
    get().log(
      `[${ownerSeat.toUpperCase()}] ${
        omphalos.artifact.card.name
      } draws a spell (now has ${newHandSize})`,
    );

    // Show the drawn card in a reveal overlay — only to the owning player
    const actorKey = get().actorKey;
    if (!actorKey || actorKey === ownerSeat) {
      get().openRevealOverlay(
        `${omphalos.artifact.card.name} draws`,
        [drawnCard],
        ownerSeat,
        `[data-omphalos-hand="${omphalosId}"]`,
      );
    }
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

  // Tadpole Pool: "(W)(W)(W) — Genesis → Summon three submerged Frog tokens here."
  // Summons three Frog minion tokens onto the site's cell and submerges them.
  // The frogs are given explicit per-token offsets — a tight row pushed toward the
  // owner's edge — so they line up neatly in front of (below) the site card instead
  // of vanishing beneath it. This is scoped to these specific tokens only; no
  // generic submerged-card rendering is touched, so other tokens are unaffected.
  _executeTadpolePoolGenesis: (cellKey: CellKey, ownerSeat: PlayerKey) => {
    const state = get();

    const frogDef = TOKEN_BY_NAME["frog"];
    if (!frogDef) {
      get().log("Tadpole Pool Genesis: Frog token definition not found");
      return;
    }

    const ownerNum = ownerSeat === "p1" ? 1 : 2;
    const cellPerms: PermanentItem[] = [...(state.permanents[cellKey] || [])];
    const permanentPositionsNext = { ...state.permanentPositions };
    const permanentAbilitiesNext = { ...state.permanentAbilities };

    // Row spacing in X, and a small push toward the owner's edge in Z so the
    // submerged frogs sit at the bottom edge of the site card (owner 1 = +Z toward
    // the bottom edge) — close enough to read as submerged in the pool, not shoved
    // down into the next tile / hand. Value verified visually in-app.
    const ownerSign = ownerNum === 1 ? 1 : -1;
    const frogSpacingX = TILE_SIZE * 0.16;
    const frogEdgeZ = ownerSign * TILE_SIZE * -0.05;

    for (let i = 0; i < 3; i++) {
      const frogCard = prepareCardForSeat(
        {
          cardId: newTokenInstanceId(frogDef),
          variantId: null,
          name: frogDef.name,
          type: "Token",
          slug: tokenSlug(frogDef),
          thresholds: null,
        },
        ownerSeat,
      );
      const instanceId = frogCard.instanceId ?? newPermanentInstanceId();

      cellPerms.push({
        owner: ownerNum as 1 | 2,
        card: frogCard,
        offset: [(i - 1) * frogSpacingX, frogEdgeZ],
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId,
        enteredOnTurn: state.turn, // Track entry turn (for Savior ward ability)
      });

      // Frog has Submerge — the tokens enter play submerged.
      permanentPositionsNext[instanceId] = {
        permanentId: instanceId,
        state: "submerged",
        position: { x: 0, y: -0.25, z: 0 },
      };
      permanentAbilitiesNext[instanceId] = {
        permanentId: instanceId,
        canBurrow: false,
        canSubmerge: true,
        requiresWaterSite: false,
        abilitySource: "Frog - Submerge (Tadpole Pool)",
      };
    }

    const permanentsNext = { ...state.permanents, [cellKey]: cellPerms };

    set({
      permanents: permanentsNext,
      permanentPositions: permanentPositionsNext,
      permanentAbilities: permanentAbilitiesNext,
    } as Partial<GameState> as GameState);

    get().log(
      `[${ownerSeat.toUpperCase()}] Tadpole Pool Genesis: summons three submerged Frog tokens`,
    );

    // Sync to opponent: only the affected cell for permanents (per patch safety
    // rules), plus the full position/ability maps merged with the new entries.
    const patch: ServerPatchT = {
      permanents: { [cellKey]: cellPerms } as GameState["permanents"],
      permanentPositions: permanentPositionsNext,
      permanentAbilities: permanentAbilitiesNext,
    };
    get().trySendPatch(patch);

    // Toast so the opponent sees the summon
    const transport = get().transport;
    if (transport?.sendMessage) {
      const playerNum = ownerSeat === "p1" ? "1" : "2";
      try {
        transport.sendMessage({
          type: "toast",
          text: `[p${playerNum}:PLAYER] summons three submerged [p${playerNum}card:Frog] tokens (Tadpole Pool)`,
          cellKey,
          seat: ownerSeat,
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});

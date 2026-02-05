import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  Permanents,
  PlayerKey,
  Zones,
} from "./types";

// Torshammar Trinket artifact: "Bearer has +1 power. After each turn, return this to its owner's hand."
export const TORSHAMMAR_TRINKET_NAME = "torshammar trinket";

export function isTorshammarTrinket(
  cardName: string | null | undefined,
): boolean {
  if (!cardName) return false;
  return cardName.toLowerCase() === TORSHAMMAR_TRINKET_NAME;
}

export type TorshammarSlice = Pick<GameState, "triggerTorshammarEndOfTurn">;

export const createTorshammarSlice: StateCreator<
  GameState,
  [],
  [],
  TorshammarSlice
> = (set, get) => ({
  triggerTorshammarEndOfTurn: (endingPlayerSeat: PlayerKey) => {
    const endingPlayerNum = endingPlayerSeat === "p1" ? 1 : 2;

    console.log("[Torshammar] triggerTorshammarEndOfTurn called:", {
      endingPlayerSeat,
      endingPlayerNum,
    });

    // Find all Torshammar Trinkets to move (collect before modifying state)
    const trinketsToMove: Array<{
      cellKey: CellKey;
      card: CardRef;
      instanceId: string | null | undefined;
    }> = [];

    const state = get();

    // Debug: log all permanents to see what's on the board
    console.log("[Torshammar] Scanning permanents:", {
      cellCount: Object.keys(state.permanents).length,
    });

    for (const [cellKey, cellPerms] of Object.entries(state.permanents)) {
      if (!cellPerms) continue;
      for (const perm of cellPerms) {
        if (!perm) continue;
        const cardName = perm.card?.name || "";
        const cardNameLower = cardName.toLowerCase();

        // Debug: log each permanent
        if (
          cardNameLower.includes("torshammar") ||
          cardNameLower.includes("trinket")
        ) {
          console.log("[Torshammar] Found potential trinket:", {
            cellKey,
            name: cardName,
            owner: perm.owner,
            endingPlayerNum,
            attachedTo: perm.attachedTo,
            instanceId: perm.instanceId,
          });
        }

        if (
          perm.owner === endingPlayerNum &&
          isTorshammarTrinket(perm.card?.name)
        ) {
          console.log("[Torshammar] Matched trinket for removal:", {
            cellKey,
            name: cardName,
          });
          trinketsToMove.push({
            cellKey: cellKey as CellKey,
            card: { ...perm.card },
            instanceId: perm.instanceId ?? undefined,
          });
        }
      }
    }

    console.log("[Torshammar] Trinkets to move:", trinketsToMove.length);

    if (trinketsToMove.length === 0) return;

    // Direct state update - bypass movePermanentToZone permission checks
    // This is an automated game effect, not a player action
    console.log("[Torshammar] Applying state update...");
    set((currentState) => {
      const per: Permanents = {};
      const zonesNext = { ...currentState.zones } as Record<PlayerKey, Zones>;

      // Deep copy zones for owner
      zonesNext[endingPlayerSeat] = {
        spellbook: [...currentState.zones[endingPlayerSeat].spellbook],
        atlas: [...currentState.zones[endingPlayerSeat].atlas],
        hand: [...currentState.zones[endingPlayerSeat].hand],
        graveyard: [...currentState.zones[endingPlayerSeat].graveyard],
        battlefield: [...currentState.zones[endingPlayerSeat].battlefield],
        collection: [...currentState.zones[endingPlayerSeat].collection],
        banished: [...(currentState.zones[endingPlayerSeat].banished || [])],
      };

      // Build instanceIds to remove
      const instanceIdsToRemove = new Set(
        trinketsToMove.map((t) => t.instanceId).filter(Boolean),
      );

      console.log("[Torshammar] instanceIdsToRemove:", [
        ...instanceIdsToRemove,
      ]);

      // Process all cells - filter out trinkets
      let totalBefore = 0;
      let totalAfter = 0;
      for (const [cellKey, cellPerms] of Object.entries(
        currentState.permanents,
      )) {
        if (!cellPerms) continue;
        totalBefore += cellPerms.length;
        const filtered = cellPerms.filter((perm) => {
          if (!perm) return false;
          // Remove by instanceId if available
          if (perm.instanceId && instanceIdsToRemove.has(perm.instanceId)) {
            console.log(
              "[Torshammar] Removing by instanceId:",
              perm.instanceId,
            );
            return false;
          }
          // Fallback: remove by owner + name match
          if (
            perm.owner === endingPlayerNum &&
            isTorshammarTrinket(perm.card?.name)
          ) {
            console.log(
              "[Torshammar] Removing by name match:",
              perm.card?.name,
            );
            return false;
          }
          return true;
        });
        totalAfter += filtered.length;
        if (filtered.length > 0) {
          per[cellKey as CellKey] = filtered;
        }
        // If filtered is empty, don't add the cell (effectively deleting it)
      }

      console.log("[Torshammar] Permanents before/after:", {
        totalBefore,
        totalAfter,
        removed: totalBefore - totalAfter,
      });

      // Add trinket cards to hand
      const handBefore = zonesNext[endingPlayerSeat].hand.length;
      for (const trinket of trinketsToMove) {
        zonesNext[endingPlayerSeat].hand.push(trinket.card);
      }
      console.log("[Torshammar] Hand before/after:", {
        handBefore,
        handAfter: zonesNext[endingPlayerSeat].hand.length,
      });

      return {
        permanents: per,
        zones: zonesNext,
      } as Partial<GameState> as GameState;
    });

    // NOTE: We do NOT send a patch here - endTurn will send a combined patch
    // after all end-of-turn triggers have completed. This prevents race conditions
    // where multiple patches could conflict or overwrite each other.
    console.log(
      "[Torshammar] State updated locally, endTurn will send combined patch",
    );

    // Log after state update
    const playerNum = endingPlayerSeat === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] Torshammar Trinket returns to hand (end of turn effect)`,
    );

    // Send toast message to both players
    const toastText = `[p${playerNum}card:Torshammar Trinket] returned to hand (end of turn)`;

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        // Send toast to opponent
        transport.sendMessage({
          type: "toast",
          text: toastText,
          seat: endingPlayerSeat,
        } as unknown as CustomMessage);

        // Also broadcast the return event for logging
        transport.sendMessage({
          type: "torshammarReturn",
          endingPlayerSeat,
          count: trinketsToMove.length,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Dispatch local toast
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("app:toast", {
          detail: { message: toastText },
        }),
      );
    }
  },
});

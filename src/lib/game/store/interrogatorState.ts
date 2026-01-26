import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type { GameState, PlayerKey, PendingInterrogatorChoice } from "./types";
import { INTERROGATOR_LIFE_COST } from "./types";

type InterrogatorSlice = Pick<
  GameState,
  | "pendingInterrogatorChoice"
  | "triggerInterrogatorChoice"
  | "resolveInterrogatorChoice"
>;

export const createInterrogatorSlice: StateCreator<
  GameState,
  [],
  [],
  InterrogatorSlice
> = (set, get) => ({
  pendingInterrogatorChoice: null,

  triggerInterrogatorChoice: (
    interrogatorSeat: PlayerKey,
    victimSeat: PlayerKey,
    attackerName: string,
    pendingCombatDamage?: {
      targetSeat: PlayerKey;
      amount: number;
      isDD: boolean;
    } | null,
  ) => {
    const id = `intg_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    const pending: PendingInterrogatorChoice = {
      id,
      interrogatorSeat,
      victimSeat,
      attackerName,
      phase: "pending",
      choice: null,
      createdAt: Date.now(),
      pendingCombatDamage: pendingCombatDamage || null,
    };

    set({ pendingInterrogatorChoice: pending });

    // Broadcast to sync state
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "interrogatorTrigger",
          id,
          interrogatorSeat,
          victimSeat,
          attackerName,
          pendingCombatDamage: pendingCombatDamage || null,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch (error) {
        console.error(
          "[triggerInterrogatorChoice] Error sending interrogatorTrigger:",
          error,
        );
      }
    }

    // Log the trigger
    try {
      const interrogatorAvatarName =
        get().avatars?.[interrogatorSeat]?.card?.name || "Interrogator";
      get().log(
        `[p${
          interrogatorSeat === "p1" ? "1" : "2"
        }:${interrogatorAvatarName}] ability triggers: ${victimSeat.toUpperCase()} must pay ${INTERROGATOR_LIFE_COST} life or allow a spell draw`,
      );
    } catch {}
  },

  resolveInterrogatorChoice: (choice: "pay" | "allow") => {
    const pending = get().pendingInterrogatorChoice;
    if (!pending || pending.phase !== "pending") return;

    const { interrogatorSeat, victimSeat } = pending;

    if (choice === "pay") {
      // Victim pays 3 life
      try {
        get().addLife(victimSeat, -INTERROGATOR_LIFE_COST);
      } catch (error) {
        console.error(
          "[resolveInterrogatorChoice] Error applying life cost:",
          error,
        );
      }
      try {
        get().log(
          `${victimSeat.toUpperCase()} pays ${INTERROGATOR_LIFE_COST} life to prevent Interrogator's draw`,
        );
      } catch {}
    } else {
      // Interrogator draws a spell from spellbook
      try {
        get().drawFrom(interrogatorSeat, "spellbook");
      } catch (error) {
        console.error(
          "[resolveInterrogatorChoice] Error drawing spell:",
          error,
        );
      }
      try {
        get().log(
          `${victimSeat.toUpperCase()} allows Interrogator's draw - ${interrogatorSeat.toUpperCase()} draws a spell`,
        );
      } catch {}
    }

    // Note: Combat damage is applied during normal combat resolution
    // Interrogator ability now triggers at attack declaration, before combat overlays

    // Update state to resolved
    set({
      pendingInterrogatorChoice: {
        ...pending,
        phase: "resolved",
        choice,
      },
    });

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "interrogatorResolve",
          id: pending.id,
          choice,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch (error) {
        console.error(
          "[resolveInterrogatorChoice] Error sending interrogatorResolve:",
          error,
        );
      }
    }

    // Clear pending state after a short delay to allow UI to show result
    setTimeout(() => {
      set((state) => {
        if (state.pendingInterrogatorChoice?.id === pending.id) {
          return { pendingInterrogatorChoice: null };
        }
        return state as GameState;
      });
    }, 500);
  },
});

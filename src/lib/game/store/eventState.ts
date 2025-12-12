import type { StateCreator } from "zustand";
import type { GameState, ServerPatchT } from "./types";
import { MAX_EVENTS } from "./types";

export type EventSlice = Pick<GameState, "events" | "eventSeq" | "log">;

export const createEventSlice: StateCreator<GameState, [], [], EventSlice> = (
  set,
  get
) => ({
  events: [],
  eventSeq: 0,
  log: (text: string) =>
    set((state) => {
      // In online play, only the acting player should log events.
      // The opponent will receive events via server patches.
      // This prevents duplicate logs from both clients logging the same action.
      const isOnline = Boolean(state.transport && state.actorKey);
      if (isOnline) {
        const currentSeat = state.currentPlayer === 1 ? "p1" : "p2";
        if (state.actorKey !== currentSeat) {
          // Not the current player's turn - don't log locally, events come from server
          return state as GameState;
        }
      }

      const nextId = state.eventSeq + 1;
      const entry = {
        id: nextId,
        ts: Date.now(),
        text,
        turn: state.turn || 1,
        player: state.currentPlayer,
      };
      const eventsAll = [...state.events, entry];
      const events =
        eventsAll.length > MAX_EVENTS
          ? eventsAll.slice(-MAX_EVENTS)
          : eventsAll;
      const patch: ServerPatchT = { events, eventSeq: nextId };
      get().trySendPatch(patch);
      return { events, eventSeq: nextId } as Partial<GameState> as GameState;
    }),
});

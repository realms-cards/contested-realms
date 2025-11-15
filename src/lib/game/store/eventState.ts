import type { StateCreator } from "zustand";
import type { GameState, ServerPatchT } from "./types";
import { MAX_EVENTS } from "./types";

export type EventSlice = Pick<GameState, "events" | "eventSeq" | "log">;

export const createEventSlice: StateCreator<
  GameState,
  [],
  [],
  EventSlice
> = (set, get) => ({
  events: [],
  eventSeq: 0,
  log: (text: string) =>
    set((state) => {
      const nextId = state.eventSeq + 1;
      const entry = {
        id: nextId,
        ts: Date.now(),
        text,
        turn: state.turn || 1,
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

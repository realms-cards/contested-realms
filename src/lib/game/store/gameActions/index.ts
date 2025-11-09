import type { StateCreator } from "zustand";
import type { GameState } from "../types";
import {
  createPlayActionsSlice,
  type PlayActionsSlice,
} from "./playActions";
import {
  createPermanentMovementSlice,
  type PermanentMovementSlice,
} from "./permanentMovement";

export type GameActionsSlice = PlayActionsSlice & PermanentMovementSlice;

export const createGameActionsSlice: StateCreator<
  GameState,
  [],
  [],
  GameActionsSlice
> = (set, get, storeApi) => ({
  ...createPlayActionsSlice(set, get, storeApi),
  ...createPermanentMovementSlice(set, get, storeApi),
});

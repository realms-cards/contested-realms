import type { StateCreator } from "zustand";
import type { GameState } from "../types";
import {
  createPermanentMovementSlice,
  type PermanentMovementSlice,
} from "./permanentMovement";
import {
  createPlayActionsSlice,
  type PlayActionsSlice,
} from "./playActions";

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

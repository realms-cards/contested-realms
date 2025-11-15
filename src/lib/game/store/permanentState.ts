import type { StateCreator } from "zustand";
import { createAttachmentActionsSlice } from "./permanentState/attachmentActions";
import { createCounterActionsSlice } from "./permanentState/counterActions";
import { createDamageActionsSlice } from "./permanentState/damageActions";
import { createTapActionsSlice } from "./permanentState/tapActions";
import type { GameState } from "./types";

type PermanentSlice = Pick<
  GameState,
  | "permanents"
  | "setTapPermanent"
  | "toggleTapPermanent"
  | "setPermanentOffset"
  | "applyDamageToPermanent"
  | "clearAllDamageForSeat"
  | "attachTokenToTopPermanent"
  | "attachTokenToPermanent"
  | "attachPermanentToAvatar"
  | "detachToken"
  | "addCounterOnPermanent"
  | "incrementPermanentCounter"
  | "decrementPermanentCounter"
  | "clearPermanentCounter"
>;

export const createPermanentSlice: StateCreator<
  GameState,
  [],
  [],
  PermanentSlice
> = (set, get, storeApi) => ({
  permanents: {},
  ...createTapActionsSlice(set, get, storeApi),
  ...createDamageActionsSlice(set, get, storeApi),
  ...createAttachmentActionsSlice(set, get, storeApi),
  ...createCounterActionsSlice(set, get, storeApi),
});

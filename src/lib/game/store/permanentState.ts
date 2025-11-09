import type { StateCreator } from "zustand";
import type { GameState } from "./types";
import { createTapActionsSlice } from "./permanentState/tapActions";
import { createDamageActionsSlice } from "./permanentState/damageActions";
import { createAttachmentActionsSlice } from "./permanentState/attachmentActions";
import { createCounterActionsSlice } from "./permanentState/counterActions";

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

import type { StateCreator } from "zustand";
import { isMinionToken } from "@/lib/game/tokens";
import { isMonumentByName, isAutomatonByName } from "../omphalosState";
import type { GameState, Permanents, PlayerKey } from "../types";
import {
  cloneCardForPatch,
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "../utils/patchHelpers";
import { bumpPermanentVersion } from "../utils/permanentHelpers";

export type AttachmentActionsSlice = Pick<
  GameState,
  | "attachTokenToTopPermanent"
  | "attachTokenToPermanent"
  | "attachPermanentToAvatar"
  | "detachToken"
>;

export const createAttachmentActionsSlice: StateCreator<
  GameState,
  [],
  [],
  AttachmentActionsSlice
> = (set, get) => ({
  attachTokenToTopPermanent: (at, index) =>
    set((state) => {
      const arr = state.permanents[at] || [];
      const token = arr[index];
      if (!token) return state;
      const nonTokenIndices = arr
        .map((it, i) => ({ it, i }))
        .filter(
          ({ it }) => !(it.card.type || "").toLowerCase().includes("token"),
        );
      if (nonTokenIndices.length === 0) return state;
      const last = nonTokenIndices[nonTokenIndices.length - 1];
      const targetIdx = last ? last.i : 0;
      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updatedToken = bumpPermanentVersion({
        ...token,
        attachedTo: { at, index: targetIdx },
      });
      list[index] = updatedToken;
      per[at] = list;
      const ownerNum = token.owner === 1 ? "1" : "2";
      get().log(
        `Attached token [p${ownerNum}card:${token.card.name}] to permanent at ${at}`,
      );
      // Include full card/owner data so opponent can render the attachment
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[index].instanceId ?? undefined,
            owner: list[index].owner,
            card: cloneCardForPatch(list[index].card),
            attachedTo: { at, index: targetIdx },
            version: list[index].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  attachTokenToPermanent: (at, tokenIndex, targetIndex) =>
    set((state) => {
      const arr = state.permanents[at] || [];
      const token = arr[tokenIndex];
      const target = arr[targetIndex];
      if (!token || !target) return state;

      const itemType = (token.card.type || "").toLowerCase();
      const itemSubTypes = (token.card.subTypes || "").toLowerCase();
      const itemName = token.card.name || "";
      const isToken = itemType.includes("token");
      const isArtifact = itemType.includes("artifact");
      const isMonument =
        itemSubTypes.includes("monument") || isMonumentByName(itemName);
      const isAutomaton =
        itemSubTypes.includes("automaton") || isAutomatonByName(itemName);
      const isCarryableArtifact = isArtifact && !isMonument && !isAutomaton;
      if (!isToken && !isCarryableArtifact) return state;

      const targetType = (target.card.type || "").toLowerCase();
      const targetSubTypes = (target.card.subTypes || "").toLowerCase();
      const targetName = target.card.name || "";
      const targetIsToken = targetType.includes("token");
      const targetIsArtifact = targetType.includes("artifact");
      const targetIsMonument =
        targetSubTypes.includes("monument") || isMonumentByName(targetName);
      const targetIsAutomaton =
        targetSubTypes.includes("automaton") || isAutomatonByName(targetName);
      const targetIsCarryableArtifact =
        targetIsArtifact && !targetIsMonument && !targetIsAutomaton;
      // Allow attaching to minion tokens (Skeleton, Foot Soldier, Frog, Bruin, Tawny)
      // Block non-minion tokens (Lance, Ward, Disabled, etc.) and carryable artifacts
      if (
        (targetIsToken && !isMinionToken(targetName)) ||
        targetIsCarryableArtifact
      )
        return state;

      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updatedToken = bumpPermanentVersion({
        ...token,
        attachedTo: { at, index: targetIndex },
      });
      list[tokenIndex] = updatedToken;
      per[at] = list;
      const itemLabel = isCarryableArtifact ? "artifact" : "token";
      get().log(
        `Attached ${itemLabel} '${token.card.name}' to permanent '${target.card.name}' at ${at}`,
      );
      // Include full card/owner data so opponent can render the attachment
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[tokenIndex].instanceId ?? undefined,
            owner: list[tokenIndex].owner,
            card: cloneCardForPatch(list[tokenIndex].card),
            attachedTo: { at, index: targetIndex },
            version: list[tokenIndex].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  attachPermanentToAvatar: (at, permanentIndex, avatarKey) =>
    set((state) => {
      const arr = state.permanents[at] || [];
      const permanent = arr[permanentIndex];
      if (!permanent) return state;
      const avatar = state.avatars[avatarKey as PlayerKey];
      if (!avatar || !avatar.pos) return state;
      const [avatarX, avatarY] = avatar.pos;
      const [permX, permY] = at.split(",").map(Number);
      if (avatarX !== permX || avatarY !== permY) {
        get().log("Cannot attach to avatar: not on same tile");
        return state;
      }
      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updatedPermanent = bumpPermanentVersion({
        ...permanent,
        attachedTo: { at, index: -1 },
      });
      list[permanentIndex] = updatedPermanent;
      per[at] = list;
      get().log(
        `Attached '${permanent.card.name}' to ${avatarKey.toUpperCase()} Avatar`,
      );
      // Include full card/owner data so opponent can render the attachment
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[permanentIndex].instanceId ?? undefined,
            owner: list[permanentIndex].owner,
            card: cloneCardForPatch(list[permanentIndex].card),
            attachedTo: { at, index: -1 },
            version: list[permanentIndex].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),

  detachToken: (at, index) =>
    set((state) => {
      const token = (state.permanents[at] || [])[index];
      if (!token) return state;
      const per: Permanents = { ...state.permanents };
      const list = [...(per[at] || [])];
      const updated = bumpPermanentVersion({ ...token, attachedTo: null });
      list[index] = updated;
      per[at] = list;
      get().log(`Detached token '${token.card.name}'`);
      const deltaPatch = createPermanentDeltaPatch([
        {
          at,
          entry: {
            instanceId: list[index].instanceId ?? undefined,
            attachedTo: null,
            version: list[index].version,
          },
        },
      ]);
      if (deltaPatch) get().trySendPatch(deltaPatch);
      else get().trySendPatch(createPermanentsPatch(per, at));
      return { permanents: per } as Partial<GameState> as GameState;
    }),
});

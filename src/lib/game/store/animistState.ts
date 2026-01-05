import type { StateCreator } from "zustand";
import { isAnimist } from "../avatarAbilities";
import type {
  AnimistCastMode,
  CardRef,
  CellKey,
  GameState,
  PendingAnimistCast,
  PermanentItem,
  ServerPatchT,
} from "./types";
import { getCellNumber } from "./utils/boardHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "./utils/patchHelpers";
import { randomTilt } from "./utils/permanentHelpers";
import { createZonesPatchFor } from "./utils/zoneHelpers";

type AnimistStateSlice = Pick<
  GameState,
  | "pendingAnimistCast"
  | "beginAnimistCast"
  | "resolveAnimistCast"
  | "cancelAnimistCast"
>;

export const createAnimistSlice: StateCreator<
  GameState,
  [],
  [],
  AnimistStateSlice
> = (set, get) => ({
  pendingAnimistCast: null,

  beginAnimistCast: (input) => {
    const { card, manaCost, cellKey, handIndex, casterSeat } = input;
    const state = get();

    // Verify caster is an Animist (or masked as one)
    const avatar = state.avatars[casterSeat];
    const avatarName = avatar?.card?.name;
    const maskedState = state.imposterMasks[casterSeat];
    const effectiveAvatarName = maskedState?.maskAvatar?.name ?? avatarName;

    if (!isAnimist(effectiveAvatarName)) {
      console.warn("[Animist] beginAnimistCast called for non-Animist avatar");
      return;
    }

    const id = `animist_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const pending: PendingAnimistCast = {
      id,
      casterSeat,
      card,
      manaCost,
      cellKey,
      handIndex,
      status: "choosing",
      chosenMode: null,
    };

    // Send to opponent so they see the choice being made
    const tr = state.transport;
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({
          type: "animistBegin",
          id,
          casterSeat,
          card,
          manaCost,
          cellKey,
          handIndex,
        } as never);
      } catch {}
    }

    set({ pendingAnimistCast: pending });
  },

  resolveAnimistCast: (mode: AnimistCastMode) => {
    const state = get();
    const pending = state.pendingAnimistCast;
    if (!pending || pending.status !== "choosing") return;

    const { casterSeat, card, manaCost, cellKey, handIndex } = pending;
    const who = casterSeat;

    // Get current hand and remove the card
    const hand = [...state.zones[who].hand];
    if (handIndex < 0 || handIndex >= hand.length) {
      console.warn("[Animist] Invalid hand index");
      set({ pendingAnimistCast: null });
      return;
    }

    // Remove card from hand
    hand.splice(handIndex, 1);

    // Get board dimensions for cell number
    const [x, y] = cellKey.split(",").map(Number);
    const cellNo = getCellNumber(x, y, state.board.size.w);
    const ownerNum = who === "p1" ? 1 : 2;
    const playerNum = who === "p1" ? "1" : "2";

    if (mode === "spirit") {
      // Cast as spirit: create a permanent with power = mana cost
      // Keep the original card data so the art displays correctly
      const per = { ...state.permanents };
      const arr = [...(per[cellKey] || [])];

      // Create a spirit permanent - keep original card data for proper display
      const spiritCard = prepareCardForSeat(card, who);

      const spiritPermanent: PermanentItem = {
        owner: ownerNum as 1 | 2,
        card: spiritCard,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: spiritCard.instanceId ?? newPermanentInstanceId(),
        // Store the spirit's power (mana cost) as a custom property
        // This will be used by the combat system
        spiritPower: manaCost,
      } as PermanentItem & { spiritPower?: number };

      arr.push(spiritPermanent);
      per[cellKey] = arr;

      // Deduct mana cost
      const currentMana = Number(state.players[who]?.mana || 0);
      const nextMana = currentMana - manaCost;
      const playersNext = {
        ...state.players,
        [who]: { ...state.players[who], mana: nextMana },
      };

      // Update zones
      const zonesNext = {
        ...state.zones,
        [who]: {
          ...state.zones[who],
          hand,
        },
      } as GameState["zones"];

      get().log(
        `[p${playerNum}:PLAYER] casts [p${playerNum}card:${card.name}] as a Spirit (Power: ${manaCost}) at #${cellNo}`
      );

      // Send patch to server
      const tr = state.transport;
      const toastMessage = `[p${playerNum}:PLAYER] cast [p${playerNum}card:${card.name}] as Spirit (Power: ${manaCost})`;
      if (tr) {
        const newest = arr[arr.length - 1];
        const deltaPatch = newest
          ? createPermanentDeltaPatch([
              {
                at: cellKey as CellKey,
                entry: { ...(newest as PermanentItem) },
              },
            ])
          : null;
        const fallbackPatch = deltaPatch
          ? null
          : createPermanentsPatch(per, cellKey as CellKey);
        const zonePatch = createZonesPatchFor(zonesNext, who);

        const combined: ServerPatchT = {
          pendingAnimistCast: null,
        };
        if (deltaPatch) Object.assign(combined, deltaPatch);
        else if (fallbackPatch?.permanents)
          combined.permanents = fallbackPatch.permanents;
        if (zonePatch?.zones) combined.zones = zonePatch.zones;
        combined.players = playersNext;

        get().trySendPatch(combined);

        // Notify opponent of the choice
        try {
          tr.sendMessage?.({
            type: "animistResolve",
            id: pending.id,
            mode,
          } as never);
        } catch {}
      }

      // Broadcast toast to both players with player color and cell for highlighting
      const toastTr = get().transport;
      if (toastTr?.sendMessage) {
        try {
          toastTr.sendMessage({
            type: "toast",
            text: toastMessage,
            cellKey,
            seat: who,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage, cellKey },
              })
            );
          }
        } catch {}
      }

      set({
        zones: zonesNext,
        permanents: per,
        players: playersNext,
        pendingAnimistCast: null,
        selectedCard: null,
      });
    } else {
      // Cast as magic: proceed with normal magic casting flow
      const per = { ...state.permanents };
      const arr = [...(per[cellKey] || [])];

      const cardWithId = prepareCardForSeat(card, who);
      const magicPermanent: PermanentItem = {
        owner: ownerNum as 1 | 2,
        card: cardWithId,
        offset: null,
        tilt: randomTilt(),
        tapVersion: 0,
        tapped: false,
        version: 0,
        instanceId: cardWithId.instanceId ?? newPermanentInstanceId(),
      };

      arr.push(magicPermanent);
      per[cellKey] = arr;

      // Deduct mana cost
      const currentMana = Number(state.players[who]?.mana || 0);
      const nextMana = currentMana - manaCost;
      const playersNext = {
        ...state.players,
        [who]: { ...state.players[who], mana: nextMana },
      };

      // Update zones
      const zonesNext = {
        ...state.zones,
        [who]: {
          ...state.zones[who],
          hand,
        },
      } as GameState["zones"];

      get().log(
        `[p${playerNum}:PLAYER] casts [p${playerNum}card:${card.name}] as Magic at #${cellNo}`
      );

      // Send patch to server
      const tr = state.transport;
      const toastMessage = `[p${playerNum}:PLAYER] cast [p${playerNum}card:${card.name}] as Magic`;
      if (tr) {
        const newest = arr[arr.length - 1];
        const deltaPatch = newest
          ? createPermanentDeltaPatch([
              {
                at: cellKey as CellKey,
                entry: { ...(newest as PermanentItem) },
              },
            ])
          : null;
        const fallbackPatch = deltaPatch
          ? null
          : createPermanentsPatch(per, cellKey as CellKey);
        const zonePatch = createZonesPatchFor(zonesNext, who);

        const combined: ServerPatchT = {
          pendingAnimistCast: null,
        };
        if (deltaPatch) Object.assign(combined, deltaPatch);
        else if (fallbackPatch?.permanents)
          combined.permanents = fallbackPatch.permanents;
        if (zonePatch?.zones) combined.zones = zonePatch.zones;
        combined.players = playersNext;

        get().trySendPatch(combined);

        // Notify opponent of the choice
        try {
          tr.sendMessage?.({
            type: "animistResolve",
            id: pending.id,
            mode,
          } as never);
        } catch {}
      }

      // Broadcast toast to both players with player color and cell for highlighting
      const toastTr = get().transport;
      if (toastTr?.sendMessage) {
        try {
          toastTr.sendMessage({
            type: "toast",
            text: toastMessage,
            cellKey,
            seat: who,
          } as never);
        } catch {}
      } else {
        // Offline: show local toast
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", {
                detail: { message: toastMessage, cellKey },
              })
            );
          }
        } catch {}
      }

      set({
        zones: zonesNext,
        permanents: per,
        players: playersNext,
        pendingAnimistCast: null,
        selectedCard: null,
      });

      // Trigger the appropriate magic cast flow based on card name
      const newest = arr[arr.length - 1];
      if (newest) {
        const cardNameLower = (card.name || "").toLowerCase();
        const spellInfo = {
          at: cellKey as CellKey,
          index: arr.length - 1,
          instanceId: newest.instanceId ?? null,
          owner: ownerNum as 1 | 2,
          card: newest.card as CardRef,
        };

        // Check for cards with custom resolvers
        const isChaosTwister = cardNameLower === "chaos twister";
        const isBrowse = cardNameLower === "browse";
        const isCommonSense = cardNameLower === "common sense";
        const isCallToWar = cardNameLower === "call to war";
        const isSearingTruth = cardNameLower === "searing truth";
        const isAccusation = cardNameLower === "accusation";
        const isEarthquake = cardNameLower === "earthquake";
        const isBlackMass = cardNameLower === "black mass";
        const isAssortedAnimals = cardNameLower === "assorted animals";

        try {
          if (isChaosTwister) {
            get().beginChaosTwister({ spell: spellInfo, casterSeat: who });
          } else if (isBrowse) {
            get().beginBrowse({ spell: spellInfo, casterSeat: who });
          } else if (isCommonSense) {
            get().beginCommonSense({ spell: spellInfo, casterSeat: who });
          } else if (isCallToWar) {
            get().beginCallToWar({ spell: spellInfo, casterSeat: who });
          } else if (isSearingTruth) {
            get().beginSearingTruth({ spell: spellInfo, casterSeat: who });
          } else if (isAccusation) {
            get().beginAccusation({ spell: spellInfo, casterSeat: who });
          } else if (isEarthquake) {
            get().beginEarthquake({ spell: spellInfo, casterSeat: who });
          } else if (isBlackMass) {
            get().beginBlackMass({ spell: spellInfo, casterSeat: who });
          } else if (isAssortedAnimals) {
            // For X spells, X = mana cost paid
            get().beginAssortedAnimals({
              spell: spellInfo,
              casterSeat: who,
              xValue: manaCost,
            });
          } else {
            // Default: generic magic cast flow for targeting
            get().beginMagicCast({
              tile: { x, y },
              spell: spellInfo,
            });
          }
        } catch {}
      }
    }
  },

  cancelAnimistCast: () => {
    const state = get();
    const pending = state.pendingAnimistCast;
    if (!pending) return;

    // Notify opponent
    const tr = state.transport;
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({
          type: "animistCancel",
          id: pending.id,
        } as never);
      } catch {}
    }

    set({ pendingAnimistCast: null });
  },
});

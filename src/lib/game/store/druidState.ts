import type { StateCreator } from "zustand";
import type {
  CellKey,
  GameState,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { isDruid } from "@/lib/game/avatarAbilities";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import { toCellKey } from "./utils/boardHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { randomTilt } from "./utils/permanentHelpers";

// Druid flipped art slug (the transformed/back side)
// Format: art_<cardname>_<finish>_<rarity> where art = arthurian_legends set prefix
export const DRUID_FLIPPED_SLUG = "art_druid_bt_s_r";

export const createInitialDruidFlipped = (): GameState["druidFlipped"] => ({
  p1: false,
  p2: false,
});

type DruidStateSlice = Pick<GameState, "druidFlipped" | "flipDruid">;

export const createDruidSlice: StateCreator<
  GameState,
  [],
  [],
  DruidStateSlice
> = (set, get) => ({
  druidFlipped: createInitialDruidFlipped(),

  flipDruid: (who: PlayerKey): boolean => {
    const state = get();

    // Check if avatar is Druid (or masked as Druid via Imposter)
    const avatar = state.avatars[who];
    const avatarName = avatar?.card?.name;
    const maskedState = state.imposterMasks[who];
    const effectiveAvatarName = maskedState?.maskAvatar?.name ?? avatarName;

    if (!isDruid(effectiveAvatarName)) {
      get().log(`Cannot flip: ${who.toUpperCase()} is not a Druid`);
      return false;
    }

    // Check if already flipped (cannot flip back)
    if (state.druidFlipped[who]) {
      get().log(`Druid has already been flipped`);
      return false;
    }

    // Check if avatar is tapped (the flip action taps the avatar)
    if (avatar?.tapped) {
      get().log(`Cannot flip: Avatar is already tapped`);
      return false;
    }

    // Check if avatar has a position
    const avatarPos = avatar?.pos;
    if (!avatarPos || avatarPos.length !== 2) {
      get().log(`Cannot flip: Avatar has no position`);
      return false;
    }

    const [x, y] = avatarPos;
    const cellKey = toCellKey(x, y) as CellKey;

    // Create Bruin token
    const bruinDef = TOKEN_BY_NAME["bruin"];
    if (!bruinDef) {
      get().log(`Cannot flip: Bruin token definition not found`);
      return false;
    }

    const ownerNum = who === "p1" ? 1 : 2;
    const bruinCard = prepareCardForSeat(
      {
        cardId: newTokenInstanceId(bruinDef),
        variantId: null,
        name: bruinDef.name,
        type: "Token",
        slug: tokenSlug(bruinDef),
        thresholds: null,
      },
      who
    );

    const bruinPermanent: PermanentItem = {
      owner: ownerNum as 1 | 2,
      card: bruinCard,
      offset: null,
      tilt: randomTilt(),
      tapVersion: 0,
      tapped: false,
      version: 0,
      instanceId: bruinCard.instanceId ?? newPermanentInstanceId(),
    };

    // Update permanents - add Bruin at avatar's position
    const permanentsNext = { ...state.permanents };
    const arr = [...(permanentsNext[cellKey] || [])];
    arr.push(bruinPermanent);
    permanentsNext[cellKey] = arr;

    // Update avatar - tap it and change the slug to the flipped art
    const avatarsNext = { ...state.avatars };
    const avatarCard = avatar.card;
    if (avatarCard) {
      avatarsNext[who] = {
        ...avatar,
        tapped: true,
        card: {
          ...avatarCard,
          slug: DRUID_FLIPPED_SLUG,
        },
      };
    }

    // Mark druid as flipped
    const druidFlippedNext = {
      ...state.druidFlipped,
      [who]: true,
    };

    // Log the action
    const playerNum = who === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] flips Druid avatar - [p${playerNum}card:Bruin] appears!`
    );

    // Send patch to server
    const tr = state.transport;
    if (tr) {
      const patch: ServerPatchT = {
        permanents: permanentsNext,
        avatars: avatarsNext,
        druidFlipped: druidFlippedNext,
      };
      get().trySendPatch(patch);

      // Send toast notification
      try {
        tr.sendMessage?.({
          type: "toast",
          text: `[p${playerNum}:PLAYER] flips their Druid - Bruin appears!`,
          seat: who,
        } as never);
      } catch {}
    }

    set({
      permanents: permanentsNext,
      avatars: avatarsNext,
      druidFlipped: druidFlippedNext,
    });

    return true;
  },
});

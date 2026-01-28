import type { StateCreator } from "zustand";
import { isNecromancer } from "@/lib/game/avatarAbilities";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import type {
  CellKey,
  GameState,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { NECROMANCER_SKELETON_COST } from "./types";
import { toCellKey } from "./utils/boardHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { randomTilt } from "./utils/permanentHelpers";

export const createInitialNecromancerSkeletonUsed =
  (): GameState["necromancerSkeletonUsed"] => ({
    p1: false,
    p2: false,
  });

type NecromancerStateSlice = Pick<
  GameState,
  "necromancerSkeletonUsed" | "summonSkeletonHere"
>;

export const createNecromancerSlice: StateCreator<
  GameState,
  [],
  [],
  NecromancerStateSlice
> = (set, get) => ({
  necromancerSkeletonUsed: createInitialNecromancerSkeletonUsed(),

  summonSkeletonHere: (who: PlayerKey): boolean => {
    const state = get();

    // Check if avatar is Necromancer (or masked as Necromancer)
    const avatar = state.avatars[who];
    const avatarName = avatar?.card?.name;
    const maskedState = state.imposterMasks[who];
    const effectiveAvatarName = maskedState?.maskAvatar?.name ?? avatarName;

    if (!isNecromancer(effectiveAvatarName)) {
      get().log(
        `Cannot summon skeleton: ${who.toUpperCase()} is not a Necromancer`,
      );
      return false;
    }

    // Check if already used this turn
    if (state.necromancerSkeletonUsed[who]) {
      get().log(`Cannot summon skeleton: already used this turn`);
      return false;
    }

    // Check if it's this player's turn
    const currentSeat = state.currentPlayer === 1 ? "p1" : "p2";
    if (who !== currentSeat) {
      get().log(`Cannot summon skeleton: not your turn`);
      return false;
    }

    // Check if player has enough mana
    const availableMana = get().getAvailableMana(who);
    if (availableMana < NECROMANCER_SKELETON_COST) {
      get().log(
        `Cannot summon skeleton: not enough mana (need ${NECROMANCER_SKELETON_COST}, have ${availableMana})`,
      );
      return false;
    }

    // Check if avatar has a position
    const avatarPos = avatar?.pos;
    if (!avatarPos || avatarPos.length !== 2) {
      get().log(`Cannot summon skeleton: avatar has no position`);
      return false;
    }

    const [x, y] = avatarPos;
    const cellKey = toCellKey(x, y) as CellKey;

    // Create skeleton token
    const skeletonDef = TOKEN_BY_NAME["skeleton"];
    if (!skeletonDef) {
      get().log(`Cannot summon skeleton: Skeleton token definition not found`);
      return false;
    }

    const ownerNum = who === "p1" ? 1 : 2;
    const skeletonCard = prepareCardForSeat(
      {
        cardId: newTokenInstanceId(skeletonDef),
        variantId: null,
        name: skeletonDef.name,
        type: "Token",
        slug: tokenSlug(skeletonDef),
        thresholds: null,
      },
      who,
    );

    const skeletonPermanent: PermanentItem = {
      owner: ownerNum as 1 | 2,
      card: skeletonCard,
      offset: null,
      tilt: randomTilt(),
      tapVersion: 0,
      tapped: false,
      version: 0,
      instanceId: skeletonCard.instanceId ?? newPermanentInstanceId(),
      enteredOnTurn: state.turn, // Track when this minion token entered (for Savior ward ability)
    };

    // Update permanents
    const permanentsNext = { ...state.permanents };
    const arr = [...(permanentsNext[cellKey] || [])];
    arr.push(skeletonPermanent);
    permanentsNext[cellKey] = arr;

    // Deduct mana
    const playersNext = {
      ...state.players,
      [who]: {
        ...state.players[who],
        mana: state.players[who].mana - NECROMANCER_SKELETON_COST,
      },
    };

    // Mark skeleton as used this turn
    const necromancerSkeletonUsedNext = {
      ...state.necromancerSkeletonUsed,
      [who]: true,
    };

    // Log the action
    const playerNum = who === "p1" ? "1" : "2";
    get().log(
      `[p${playerNum}:PLAYER] summons [p${playerNum}card:Skeleton] at avatar's location (paid ${NECROMANCER_SKELETON_COST} mana)`,
    );

    // Send patch to server
    const tr = state.transport;
    if (tr) {
      // Only send affected player's data to avoid overwriting opponent's state
      const patch: ServerPatchT = {
        permanents: permanentsNext,
        players: { [who]: playersNext[who] } as GameState["players"],
        necromancerSkeletonUsed: necromancerSkeletonUsedNext,
      };
      get().trySendPatch(patch);

      // Send toast notification
      try {
        tr.sendMessage?.({
          type: "toast",
          text: `[p${playerNum}:PLAYER] summons [p${playerNum}card:Skeleton] (Necromancer ability)`,
          seat: who,
        } as never);
      } catch {}
    }

    set({
      permanents: permanentsNext,
      players: playersNext,
      necromancerSkeletonUsed: necromancerSkeletonUsedNext,
    });

    return true;
  },
});

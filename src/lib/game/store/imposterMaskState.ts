import type { StateCreator } from "zustand";
import { isImposter } from "@/lib/game/avatarAbilities";
import type {
  CardRef,
  GameState,
  ImposterMaskState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { IMPOSTER_MASK_COST } from "./types";

// Re-export the mask cost constant
export { IMPOSTER_MASK_COST } from "./types";

/**
 * Creates the initial imposter masks state (null for both players)
 */
export function createInitialImposterMasks(): Record<
  PlayerKey,
  ImposterMaskState | null
> {
  return {
    p1: null,
    p2: null,
  };
}

type ImposterMaskSlice = Pick<
  GameState,
  "imposterMasks" | "maskWith" | "unmask" | "breakMask"
>;

export const createImposterMaskSlice: StateCreator<
  GameState,
  [],
  [],
  ImposterMaskSlice
> = (set, get) => ({
  imposterMasks: createInitialImposterMasks(),

  /**
   * Mask yourself: banish an avatar from collection to become that avatar.
   * Costs 3 mana. Returns true if successful, false otherwise.
   */
  maskWith: (who: PlayerKey, maskAvatar: CardRef): boolean => {
    const state = get();

    // Verify the player's avatar is Imposter
    const currentAvatar = state.avatars[who]?.card;
    if (!currentAvatar) {
      state.log(`Cannot mask: ${who.toUpperCase()} has no avatar`);
      return false;
    }

    // Check if already masked - need to use original Imposter for validation
    const existingMask = state.imposterMasks[who];
    const avatarToCheck = existingMask
      ? existingMask.originalAvatar
      : currentAvatar;

    if (!isImposter(avatarToCheck.name)) {
      state.log(`Cannot mask: ${who.toUpperCase()}'s avatar is not Imposter`);
      return false;
    }

    // Warn if not enough mana, but don't block
    const availableMana = state.getAvailableMana(who);
    const MASK_COST = IMPOSTER_MASK_COST;
    if (availableMana < MASK_COST) {
      state.log(
        `Warning: ${who.toUpperCase()} needs ${MASK_COST} mana to mask (has ${availableMana})`,
      );
    }

    // Verify the mask avatar is in collection
    const collection = state.zones[who].collection;
    const maskCardIndex = collection.findIndex(
      (c) =>
        c.cardId === maskAvatar.cardId &&
        c.instanceId === maskAvatar.instanceId,
    );
    if (maskCardIndex === -1) {
      state.log(
        `Cannot mask: ${
          maskAvatar.name
        } not found in ${who.toUpperCase()}'s collection`,
      );
      return false;
    }

    // If already masked, banish current mask first
    if (existingMask) {
      const banished = [...state.zones[who].banished, existingMask.maskAvatar];
      state.log(
        `${who.toUpperCase()} removes ${
          existingMask.maskAvatar.name
        } mask (banished)`,
      );
      // Update zones with banished mask
      set((s) => ({
        zones: {
          ...s.zones,
          [who]: { ...s.zones[who], banished },
        },
      }));
    }

    // Store the original Imposter avatar if not already masked
    const originalAvatar = existingMask
      ? existingMask.originalAvatar
      : currentAvatar;

    // Remove mask avatar from collection and add to banished
    const newCollection = [...collection];
    newCollection.splice(maskCardIndex, 1);
    const newBanished = [...get().zones[who].banished, maskAvatar];

    // Create the new mask state
    const newMaskState: ImposterMaskState = {
      originalAvatar,
      maskAvatar,
      maskedAt: Date.now(),
    };

    // Deduct mana
    const newMana = state.players[who].mana - MASK_COST;

    // Update avatar to display the mask avatar
    const newAvatars = {
      ...state.avatars,
      [who]: {
        ...state.avatars[who],
        card: maskAvatar,
      },
    };

    // Update imposter masks
    const newImposterMasks = {
      ...state.imposterMasks,
      [who]: newMaskState,
    };

    // Update zones
    const newZones = {
      ...state.zones,
      [who]: {
        ...state.zones[who],
        collection: newCollection,
        banished: newBanished,
      },
    };

    // Update players mana
    const newPlayers = {
      ...state.players,
      [who]: {
        ...state.players[who],
        mana: newMana,
      },
    };

    // Build and send patch
    // IMPORTANT: In online play, the server will reject/ignore patches that attempt
    // to mutate opponent-private zones. If we send full `zones` for both seats,
    // we risk the server dropping the patch entirely, which would prevent the
    // opponent from seeing the new masked avatar.
    const patch: ServerPatchT = {
      avatars: newAvatars,
      imposterMasks: newImposterMasks,
      zones: { [who]: newZones[who] } as GameState["zones"],
      players: { [who]: newPlayers[who] } as GameState["players"],
    };

    get().trySendPatch(patch);
    get().log(
      `${who.toUpperCase()}'s Imposter masks as ${
        maskAvatar.name
      } (${MASK_COST} mana)`,
    );

    set({
      avatars: newAvatars,
      imposterMasks: newImposterMasks,
      zones: newZones,
      players: newPlayers,
    } as Partial<GameState> as GameState);

    return true;
  },

  /**
   * Unmask: voluntarily remove the mask, banish it, and restore original Imposter.
   */
  unmask: (who: PlayerKey) => {
    const state = get();
    const maskState = state.imposterMasks[who];

    if (!maskState) {
      state.log(`Cannot unmask: ${who.toUpperCase()} is not masked`);
      return;
    }

    // Banish the current mask avatar (already banished when masking, but log)
    state.log(
      `${who.toUpperCase()} unmasks, banishing ${maskState.maskAvatar.name}`,
    );

    // Restore original Imposter avatar
    const newAvatars = {
      ...state.avatars,
      [who]: {
        ...state.avatars[who],
        card: maskState.originalAvatar,
      },
    };

    // Clear the mask state
    const newImposterMasks = {
      ...state.imposterMasks,
      [who]: null,
    };

    // Build and send patch
    const patch: ServerPatchT = {
      avatars: newAvatars,
      imposterMasks: newImposterMasks,
    };

    get().trySendPatch(patch);
    get().log(
      `${who.toUpperCase()}'s Imposter revealed (was masked as ${
        maskState.maskAvatar.name
      })`,
    );

    set({
      avatars: newAvatars,
      imposterMasks: newImposterMasks,
    } as Partial<GameState> as GameState);
  },

  /**
   * Break mask due to damage: automatically unmask when Imposter takes damage.
   * The mask avatar is banished.
   */
  breakMask: (who: PlayerKey) => {
    const state = get();
    const maskState = state.imposterMasks[who];

    if (!maskState) {
      // Not masked, nothing to break
      return;
    }

    state.log(
      `${who.toUpperCase()}'s mask breaks! ${
        maskState.maskAvatar.name
      } is banished.`,
    );

    // Restore original Imposter avatar
    const newAvatars = {
      ...state.avatars,
      [who]: {
        ...state.avatars[who],
        card: maskState.originalAvatar,
      },
    };

    // Clear the mask state
    const newImposterMasks = {
      ...state.imposterMasks,
      [who]: null,
    };

    // Build and send patch
    const patch: ServerPatchT = {
      avatars: newAvatars,
      imposterMasks: newImposterMasks,
    };

    get().trySendPatch(patch);

    set({
      avatars: newAvatars,
      imposterMasks: newImposterMasks,
    } as Partial<GameState> as GameState);
  },
});

/**
 * Helper: Check if a player is currently masked
 */
export function isMasked(
  imposterMasks: Record<PlayerKey, ImposterMaskState | null>,
  who: PlayerKey,
): boolean {
  return imposterMasks[who] !== null;
}

/**
 * Helper: Get the original Imposter avatar if masked, or null
 */
export function getOriginalImposter(
  imposterMasks: Record<PlayerKey, ImposterMaskState | null>,
  who: PlayerKey,
): CardRef | null {
  return imposterMasks[who]?.originalAvatar ?? null;
}

/**
 * Helper: Check if a card is an avatar type
 */
export function isAvatarCard(card: CardRef | null | undefined): boolean {
  if (!card?.type) return false;
  return card.type.toLowerCase().includes("avatar");
}

/**
 * Attack of the Realm Eater - Actions State Slice
 *
 * Handles player actions and card playing
 */

import type { StateCreator } from "zustand";
import type { CellKey } from "@/lib/game/store";
import { executeMagicEffect } from "../../magic-effects";
import type { AotreStore } from "../../types";
import type { PlayerSlot } from "../../types/player";

export interface ActionsSlice {
  playCard: (player: PlayerSlot, cardIndex: number, targetCell: CellKey) => boolean;
  moveUnit: (fromCell: CellKey, unitIndex: number, toCell: CellKey) => boolean;
  attack: (
    attackerCell: CellKey,
    attackerIndex: number,
    targetCell: CellKey,
    targetIndex?: number
  ) => boolean;
}

export const createActionsSlice: StateCreator<
  AotreStore,
  [],
  [],
  ActionsSlice
> = (set, get) => ({
  /**
   * Play a card from a player's hand
   */
  playCard: (player, cardIndex, targetCell) => {
    const state = get();

    // Validate it's this player's turn
    if (state.activePlayer !== player) {
      console.warn("Not this player's turn");
      return false;
    }

    // Validate player has passed
    if (state.passedPlayers.has(player)) {
      console.warn("Player has already passed");
      return false;
    }

    // Get the card
    const playerState = state.players[player];
    if (!playerState || cardIndex < 0 || cardIndex >= playerState.hand.length) {
      console.warn("Invalid card index");
      return false;
    }

    const card = playerState.hand[cardIndex];

    // Check if player can afford the card (using shared mana)
    const manaCost = card.cost ?? 0;
    if (!state.canAffordCost(manaCost, card.thresholds ?? undefined)) {
      console.warn("Cannot afford card");
      return false;
    }

    // Spend the mana
    if (!state.spendMana(manaCost)) {
      return false;
    }

    // Remove card from hand
    const removedCard = state.removeCardFromHand(player, cardIndex);
    if (!removedCard) return false;

    // Add card to board as permanent (for units)
    if (card.type === "Unit" || card.type === "Minion") {
      state.addPermanent(targetCell, removedCard);
    }
    // Handle Magic/Spell cards - execute the card's specific effect
    else if (card.type === "Magic" || card.type === "Spell") {
      // Execute the magic effect using the card-specific handler
      const result = executeMagicEffect(get, removedCard, targetCell);

      // Log the effect result
      if (result.success) {
        console.log(`[AOTRE Magic] ${result.message}`);
        set({
          aiActionLog: [
            ...get().aiActionLog,
            result.message,
          ],
        });
      }
    }
    // Handle Aura cards - attach to permanent at target (simplified: just play it)
    else if (card.type === "Aura") {
      // Auras would attach to permanents - for now just consume the card
    }
    // Handle Site cards - add to the tile
    else if (card.type === "Site") {
      // Update the tile to be a site with this card
      const tile = state.tiles[targetCell];
      if (tile) {
        set({
          tiles: {
            ...state.tiles,
            [targetCell]: {
              ...tile,
              state: "site",
              site: removedCard,
              manaValue: removedCard.cost ?? 1,
              thresholds: removedCard.thresholds ?? null,
            },
          },
        });
        // Recalculate mana after adding a site
        get().recalculateMana();
      }
    }

    // Record the action
    state.recordAction({
      player,
      type: "play_card",
      payload: {
        type: "play_card",
        cardIndex,
        targetCell,
      },
      timestamp: Date.now(),
    });

    // Advance to next player
    get().advanceTurn();

    return true;
  },

  /**
   * Move a unit on the board
   * Units with summoning sickness cannot move
   */
  moveUnit: (fromCell, unitIndex, toCell) => {
    const state = get();

    // Get the unit
    const units = state.permanents[fromCell];
    if (!units || unitIndex < 0 || unitIndex >= units.length) {
      console.warn("Invalid unit");
      return false;
    }

    const unit = units[unitIndex];

    // Check for summoning sickness
    if (unit.instanceId && state.hasSummoningSickness(unit.instanceId)) {
      console.warn("Unit has summoning sickness and cannot move");
      return false;
    }

    // Validate target cell has a site
    const targetTile = state.tiles[toCell];
    if (!targetTile || targetTile.state !== "site") {
      console.warn("Cannot move to non-site tile");
      return false;
    }

    // Move the permanent
    const success = state.movePermanent(fromCell, unitIndex, toCell);
    if (!success) return false;

    // Record the action
    const activePlayer = state.activePlayer;
    state.recordAction({
      player: activePlayer,
      type: "move_unit",
      payload: {
        type: "move_unit",
        fromCell,
        unitIndex,
        toCell,
      },
      timestamp: Date.now(),
    });

    // Advance to next player
    get().advanceTurn();

    return true;
  },

  /**
   * Attack with a unit
   * Units with summoning sickness cannot attack
   */
  attack: (attackerCell, attackerIndex, targetCell, targetIndex) => {
    const state = get();

    // Get the attacker
    const attackers = state.permanents[attackerCell];
    if (!attackers || attackerIndex < 0 || attackerIndex >= attackers.length) {
      console.warn("Invalid attacker");
      return false;
    }

    const attacker = attackers[attackerIndex];

    // Check for summoning sickness
    if (attacker.instanceId && state.hasSummoningSickness(attacker.instanceId)) {
      console.warn("Unit has summoning sickness and cannot attack");
      return false;
    }

    const attackValue = attacker.attack ?? 1;

    // Determine target
    let targetType: "minion" | "realm_eater" | "site" = "site";
    let targetId = "";

    // Check if attacking a minion
    const minion = state.getMinionAt(targetCell);
    if (minion) {
      targetType = "minion";
      targetId = minion.id;
    }

    // Check if attacking the Realm Eater
    if (state.realmEater.position === targetCell) {
      targetType = "realm_eater";
      targetId = "realm_eater";
    }

    // Set up combat
    set({
      activeCombat: {
        attacker: {
          type: "player_unit",
          id: `${attackerCell}:${attackerIndex}`,
          position: attackerCell,
        },
        defender: {
          type:
            targetType === "minion"
              ? "realm_eater_minion"
              : targetType === "realm_eater"
              ? "realm_eater"
              : "site",
          id: targetId,
          position: targetCell,
        },
        damage: attackValue,
        resolved: false,
      },
    });

    // Resolve combat immediately (simplified)
    get().resolveCombat();

    // Record the action
    const activePlayer = state.activePlayer;
    state.recordAction({
      player: activePlayer,
      type: "attack",
      payload: {
        type: "attack",
        attackerCell,
        attackerIndex,
        targetCell,
        targetIndex,
      },
      timestamp: Date.now(),
    });

    // Advance to next player
    get().advanceTurn();

    return true;
  },
});

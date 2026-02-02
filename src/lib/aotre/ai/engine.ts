/**
 * Attack of the Realm Eater - AI Engine
 *
 * Main decision loop for the Realm Eater AI
 * Deterministic rule-based system (not beam search like PvP bot)
 */

import type { CellKey } from "@/lib/game/store";
import type { AotreStore, RealmEaterAIPhase } from "../types";
import { getNextStep, findRandomSite, getManhattanDistance } from "./pathfinding";
import { DIFFICULTY_CONFIG } from "../constants";
import type { MinionEntity } from "../types/entities";

/**
 * AI Action types that can be performed
 */
export type AIActionType =
  | "move"
  | "consume"
  | "spawn"
  | "minion_move"
  | "minion_attack"
  | "cast"
  | "update_destination"
  | "damage_avatar";

/**
 * AI Action payload
 */
export interface AIAction {
  type: AIActionType;
  payload: Record<string, unknown>;
  description: string;
}

/**
 * Execute the Realm Eater's complete turn
 * This is the main entry point called from the store
 */
export async function executeRealmEaterAI(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  onAction?: (action: AIAction) => void
): Promise<void> {
  const logAction = (action: AIAction) => {
    onAction?.(action);
    const state = getState();
    setState({
      aiActionLog: [...state.aiActionLog, action.description],
    });
  };

  // Phase 1: Start - Collect resources, untap
  await executeStartPhase(getState, setState, logAction);
  await delay(300);

  // Phase 2: Movement - Move toward destination
  await executeMovementPhase(getState, setState, logAction);
  await delay(300);

  // Phase 3: Site Consumption - Previous site becomes rubble
  await executeConsumptionPhase(getState, setState, logAction);
  await delay(300);

  // Phase 4: Spawning - Summon minions using Power Pool
  await executeSpawningPhase(getState, setState, logAction);
  await delay(300);

  // Phase 5: Minion Actions - Each minion moves and/or attacks
  await executeMinionActionsPhase(getState, setState, logAction);
  await delay(300);

  // Phase 6: Magic - Cast spells from magic deck (placeholder)
  await executeMagicPhase(getState, setState, logAction);
  await delay(300);

  // Phase 7: End - Cleanup
  await executeEndPhase(getState, setState, logAction);
}

/**
 * Delay helper for animation
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 1: Start Phase
 * - Fill Mana Pool: (2 × Players) + DifficultyMod + SitesInHand
 * - Fill Power Pool: 2 × Mana Pool
 * - Untap minions
 */
async function executeStartPhase(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  logAction: (action: AIAction) => void
): Promise<void> {
  setState({ aiPhase: "Start" as RealmEaterAIPhase });

  const state = getState();
  const config = DIFFICULTY_CONFIG[state.difficulty];

  // Count sites in Realm Eater's hand (consumed sites)
  const sitesInHand = state.realmEater.hand.length;

  // Official formula: Mana = (2 × Players) + DifficultyModifier + SitesConsumed
  // DifficultyModifier: Easy = 2, Normal = 4, Hard = 6 (stored in manaMultiplier)
  const newManaPool = (2 * state.playerCount) + config.manaMultiplier + sitesInHand;

  // Power Pool is 2× the Mana Pool
  const newPowerPool = 2 * newManaPool;

  setState({
    realmEater: {
      ...state.realmEater,
      manaPool: newManaPool,
      powerPool: newPowerPool,
    },
  });

  // Untap all minions
  const untappedMinions = state.minions.map((m) => ({ ...m, tapped: false }));
  setState({ minions: untappedMinions });

  logAction({
    type: "move",
    payload: { manaPool: newManaPool, powerPool: newPowerPool, sitesConsumed: sitesInHand },
    description: `Realm Eater awakens (Mana: ${newManaPool}, Power: ${newPowerPool}, Sites consumed: ${sitesInHand})`,
  });
}

/**
 * Phase 2: Movement Phase
 * - Move toward destination marker
 * - Update destination if reached
 */
async function executeMovementPhase(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  logAction: (action: AIAction) => void
): Promise<void> {
  setState({ aiPhase: "Movement" as RealmEaterAIPhase });

  const state = getState();
  const currentPosition = state.realmEater.position;
  const destination = state.destination.cellKey;

  // Check if at destination
  if (currentPosition === destination) {
    // Find new destination
    const newDestination = findRandomSite(state.tiles, currentPosition);
    if (newDestination) {
      setState({
        destination: { cellKey: newDestination, turnsAtPosition: 0 },
      });
      logAction({
        type: "update_destination",
        payload: { newDestination },
        description: `Realm Eater sets new destination`,
      });
    }
  }

  // Get next step toward destination
  const nextStep = getNextStep(
    currentPosition,
    getState().destination.cellKey,
    state.tiles
  );

  if (nextStep) {
    setState({
      realmEater: {
        ...state.realmEater,
        position: nextStep,
      },
    });
    logAction({
      type: "move",
      payload: { from: currentPosition, to: nextStep },
      description: `Realm Eater moves to ${nextStep}`,
    });
  } else {
    logAction({
      type: "move",
      payload: {},
      description: `Realm Eater cannot move (path blocked)`,
    });
  }
}

/**
 * Phase 3: Consumption Phase
 * - Convert current site to rubble
 * - Convert old rubble to void
 */
async function executeConsumptionPhase(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  logAction: (action: AIAction) => void
): Promise<void> {
  setState({ aiPhase: "SiteConsumption" as RealmEaterAIPhase });

  const state = getState();
  const currentPosition = state.realmEater.position;
  const currentTile = state.tiles[currentPosition];

  // First, convert old rubble to void
  const updatedTiles = { ...state.tiles };
  let voidCount = 0;

  for (const [key, tile] of Object.entries(state.tiles)) {
    if (
      tile.state === "rubble" &&
      tile.rubbleSinceTurn !== null &&
      tile.rubbleSinceTurn < state.turn
    ) {
      updatedTiles[key] = {
        ...tile,
        state: "void",
        site: null,
        manaValue: 0,
        thresholds: null,
        rubbleSinceTurn: null,
      };
      voidCount++;
    }
  }

  if (voidCount > 0) {
    logAction({
      type: "consume",
      payload: { voidCount },
      description: `${voidCount} rubble tiles collapse into the void`,
    });
  }

  // Then, consume current site (if it's a site)
  if (currentTile && currentTile.state === "site") {
    updatedTiles[currentPosition] = {
      ...currentTile,
      state: "rubble",
      manaValue: 0,
      thresholds: null,
      rubbleSinceTurn: state.turn,
    };

    logAction({
      type: "consume",
      payload: { position: currentPosition, siteName: currentTile.site?.name },
      description: `Realm Eater consumes ${currentTile.site?.name ?? "site"} at ${currentPosition}`,
    });
  }

  setState({ tiles: updatedTiles });

  // Recalculate shared mana
  getState().recalculateMana();

  // Check win conditions
  getState().checkWinConditions();
}

/**
 * Phase 4: Spawning Phase
 * - Use Power Pool to spawn minions from the minion deck
 */
async function executeSpawningPhase(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  logAction: (action: AIAction) => void
): Promise<void> {
  setState({ aiPhase: "Spawning" as RealmEaterAIPhase });

  const state = getState();
  const config = DIFFICULTY_CONFIG[state.difficulty];

  // Only spawn on certain turns based on difficulty
  if (state.turn % config.spawnCooldown !== 0) {
    logAction({
      type: "spawn",
      payload: {},
      description: `Realm Eater gathers power...`,
    });
    return;
  }

  // Check if we have enough power to spawn
  const spawnCost = 3; // Power cost per minion
  if (state.realmEater.powerPool < spawnCost) {
    logAction({
      type: "spawn",
      payload: {},
      description: `Not enough power to spawn minions`,
    });
    return;
  }

  // Find spawn location (adjacent to Realm Eater, on a site)
  const rePosition = state.realmEater.position;
  const [rx, ry] = rePosition.split(",").map(Number);
  const adjacentCells = [
    `${rx},${ry - 1}`,
    `${rx},${ry + 1}`,
    `${rx - 1},${ry}`,
    `${rx + 1},${ry}`,
  ];

  const spawnLocations = adjacentCells.filter((cell) => {
    const tile = state.tiles[cell];
    return tile && (tile.state === "site" || tile.state === "rubble");
  });

  if (spawnLocations.length === 0) {
    logAction({
      type: "spawn",
      payload: {},
      description: `No valid spawn locations for minions`,
    });
    return;
  }

  // Draw a card from the minion deck using the store method
  const drawnCard = getState().drawMinionCard();

  if (!drawnCard) {
    logAction({
      type: "spawn",
      payload: {},
      description: `No minions available to spawn`,
    });
    return;
  }

  // Spawn the minion using the real card data
  const spawnLocation = spawnLocations[Math.floor(Math.random() * spawnLocations.length)];

  // Use the card's attack/defence stats if available, otherwise use defaults
  const cardAttack = typeof drawnCard.attack === "number" ? drawnCard.attack : 2;
  const cardDefence = typeof drawnCard.defence === "number" ? drawnCard.defence : 2;

  const newMinion: MinionEntity = {
    id: `minion_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    position: spawnLocation,
    card: drawnCard, // Use the real card with slug for rendering
    tapped: false,
    health: cardDefence,
    attack: cardAttack,
    summonedOnTurn: state.turn,
    owner: "realm_eater",
  };

  setState({
    minions: [...getState().minions, newMinion],
    realmEater: {
      ...getState().realmEater,
      powerPool: getState().realmEater.powerPool - spawnCost,
    },
  });

  logAction({
    type: "spawn",
    payload: { minion: newMinion.id, location: spawnLocation, cardName: drawnCard.name },
    description: `Realm Eater spawns ${drawnCard.name} at ${spawnLocation}`,
  });
}

/**
 * Phase 5: Minion Actions Phase
 * - Each minion moves toward players and attacks
 */
async function executeMinionActionsPhase(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  logAction: (action: AIAction) => void
): Promise<void> {
  setState({ aiPhase: "MinionActions" as RealmEaterAIPhase });

  const state = getState();

  if (state.minions.length === 0) {
    logAction({
      type: "minion_move",
      payload: {},
      description: `No minions to act`,
    });
    return;
  }

  // Get all player avatar positions
  const playerPositions: CellKey[] = [];
  for (const player of Object.values(state.players)) {
    if (player && player.isAlive && player.avatarPosition) {
      playerPositions.push(player.avatarPosition);
    }
  }

  if (playerPositions.length === 0) {
    logAction({
      type: "minion_move",
      payload: {},
      description: `No player targets for minions`,
    });
    return;
  }

  // Process each minion
  const updatedMinions = [...state.minions];
  for (let i = 0; i < updatedMinions.length; i++) {
    const minion = updatedMinions[i];

    if (minion.tapped) continue; // Already acted

    // Check if adjacent to a player avatar
    const [_mx, _my] = minion.position.split(",").map(Number);
    const adjacentToPlayer = playerPositions.find((pPos) => {
      const distance = getManhattanDistance(minion.position, pPos);
      return distance === 1;
    });

    const minionName = minion.card.name || "Minion";

    if (adjacentToPlayer) {
      // Attack the player!
      const damage = minion.attack;

      // Find which player this is
      for (const [slot, player] of Object.entries(state.players)) {
        if (player && player.avatarPosition === adjacentToPlayer) {
          getState().dealDamageToAvatar(
            slot as "player1" | "player2" | "player3" | "player4",
            damage
          );
          logAction({
            type: "minion_attack",
            payload: { minion: minion.id, target: slot, damage, cardName: minionName },
            description: `${minionName} attacks ${player.name} for ${damage} damage!`,
          });
          break;
        }
      }

      // Mark as tapped
      updatedMinions[i] = { ...minion, tapped: true };
    } else {
      // Move toward nearest player
      const nearestPlayer = playerPositions.reduce((nearest, pos) => {
        const dist = getManhattanDistance(minion.position, pos);
        const nearestDist = getManhattanDistance(minion.position, nearest);
        return dist < nearestDist ? pos : nearest;
      }, playerPositions[0]);

      const nextStep = getNextStep(minion.position, nearestPlayer, state.tiles);

      if (nextStep) {
        updatedMinions[i] = {
          ...minion,
          position: nextStep,
          tapped: true,
        };
        logAction({
          type: "minion_move",
          payload: { minion: minion.id, from: minion.position, to: nextStep, cardName: minionName },
          description: `${minionName} moves toward player`,
        });
      }
    }
  }

  setState({ minions: updatedMinions });
}

/**
 * Phase 6: Magic Phase
 * - Cast spells from the magic deck
 */
async function executeMagicPhase(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  logAction: (action: AIAction) => void
): Promise<void> {
  setState({ aiPhase: "Magic" as RealmEaterAIPhase });

  const state = getState();
  const config = DIFFICULTY_CONFIG[state.difficulty];

  // Only cast magic on certain turns
  if (state.turn % config.magicFrequency !== 0) {
    logAction({
      type: "cast",
      payload: {},
      description: `Realm Eater channels dark energy...`,
    });
    return;
  }

  // Draw a spell from the magic deck
  const drawnSpell = getState().drawMagicCard();

  if (!drawnSpell) {
    logAction({
      type: "cast",
      payload: {},
      description: `No spells available to cast`,
    });
    return;
  }

  // Check if enough mana to cast (use card cost if available)
  const spellCost = typeof drawnSpell.cost === "number" ? drawnSpell.cost : 2;
  if (state.realmEater.manaPool < spellCost) {
    // Put the spell back on the bottom of the deck
    setState({
      realmEater: {
        ...state.realmEater,
        magicDeck: [...state.realmEater.magicDeck, drawnSpell],
      },
    });
    logAction({
      type: "cast",
      payload: {},
      description: `Not enough mana to cast ${drawnSpell.name}`,
    });
    return;
  }

  // Simple effect: damage a random player (scales with card attack or turn)
  const alivePlayers = Object.entries(state.players).filter(
    ([, p]) => p && p.isAlive
  );

  if (alivePlayers.length > 0) {
    const [slot, player] = alivePlayers[
      Math.floor(Math.random() * alivePlayers.length)
    ];

    // Use card attack as damage if available, otherwise scale with game length
    const baseDamage = typeof drawnSpell.attack === "number" ? drawnSpell.attack : 0;
    const damage = Math.max(1, baseDamage || 1 + Math.floor(state.turn / 5));

    getState().dealDamageToAvatar(
      slot as "player1" | "player2" | "player3" | "player4",
      damage
    );

    // Spend mana and move spell to graveyard
    setState({
      realmEater: {
        ...getState().realmEater,
        manaPool: getState().realmEater.manaPool - spellCost,
        magicGraveyard: [...getState().realmEater.magicGraveyard, drawnSpell],
      },
    });

    logAction({
      type: "cast",
      payload: { target: slot, damage, spellName: drawnSpell.name, slug: drawnSpell.slug },
      description: `Realm Eater casts ${drawnSpell.name} at ${player?.name} for ${damage} damage!`,
    });
  } else {
    // No targets - put spell on bottom of deck
    setState({
      realmEater: {
        ...state.realmEater,
        magicDeck: [...state.realmEater.magicDeck, drawnSpell],
      },
    });
  }
}

/**
 * Phase 7: End Phase
 * - Cleanup and signal end of turn
 */
async function executeEndPhase(
  getState: () => AotreStore,
  setState: (partial: Partial<AotreStore>) => void,
  logAction: (action: AIAction) => void
): Promise<void> {
  setState({ aiPhase: "End" as RealmEaterAIPhase });

  logAction({
    type: "move",
    payload: {},
    description: `Realm Eater turn ends`,
  });

  // Check win conditions one more time
  getState().checkWinConditions();
}

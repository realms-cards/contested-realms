"use client";

/**
 * Attack of the Realm Eater - Setup Screen
 *
 * Player count and difficulty selection before starting a game
 */

import { useState, useCallback } from "react";
import { loadAotreCards } from "@/lib/aotre/cardLoader";
import { DIFFICULTY_CONFIG, BOARD_CONFIGS, PLAYER_STARTING_HAND_SIZE } from "@/lib/aotre/constants";
import { useAotreStore } from "@/lib/aotre/store";
import type { Difficulty } from "@/lib/aotre/types";
import type { PlayerSlot } from "@/lib/aotre/types/player";

export function SetupScreen() {
  const [playerCount, setPlayerCount] = useState<1 | 2 | 3 | 4>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleStartGame = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      // Load real Sorcery cards from the database
      const siteCount = BOARD_CONFIGS[playerCount].siteCount;
      const cardSet = await loadAotreCards(playerCount, siteCount);

      // Get store actions
      const store = useAotreStore.getState();

      // Initialize core game state
      store.initializeGame(playerCount, difficulty, cardSet.avatars.map((avatar, i) => ({
        avatarId: avatar.cardId,
        spellbookIds: (cardSet.playerCards[i] ?? []).map(c => c.cardId),
        atlasIds: cardSet.sites.slice(i * 10, (i + 1) * 10).map(c => c.cardId),
      })));

      // Initialize board with real site cards
      store.initializeBoard(playerCount, cardSet.sites);

      // Initialize Realm Eater
      store.initializeRealmEater(
        playerCount,
        difficulty,
        cardSet.realmEaterMagic,
        cardSet.realmEaterMinions
      );

      // Initialize players with real cards (basic init first)
      store.initializePlayers(playerCount, cardSet.avatars.map((avatar, i) => ({
        avatarId: avatar.cardId,
        spellbookIds: (cardSet.playerCards[i] ?? []).map(c => c.cardId),
        atlasIds: cardSet.sites.slice(i * 10, (i + 1) * 10).map(c => c.cardId),
      })));

      // Now enhance players with real card data
      const slots: PlayerSlot[] = ["player1", "player2", "player3", "player4"];
      const currentPlayers = useAotreStore.getState().players;
      const enhancedPlayers = { ...currentPlayers };

      for (let i = 0; i < playerCount; i++) {
        const slot = slots[i];
        const player = enhancedPlayers[slot];
        const avatar = cardSet.avatars[i];
        const spellbook = cardSet.playerCards[i] ?? [];
        const atlas = cardSet.sites.slice(i * 10, (i + 1) * 10);

        if (player) {
          enhancedPlayers[slot] = {
            ...player,
            avatar: avatar ? {
              cardId: avatar.cardId,
              name: avatar.name,
              type: avatar.type ?? "Avatar",
              slug: avatar.slug,
            } : null,
            spellbook: spellbook.map(c => ({
              cardId: c.cardId,
              name: c.name,
              type: c.type,
              slug: c.slug,
              cost: c.cost,
              attack: c.attack,
              defence: c.defence,
              thresholds: c.thresholds,
            })),
            atlas: atlas.map(c => ({
              cardId: c.cardId,
              name: c.name,
              type: c.type ?? "Site",
              slug: c.slug,
              thresholds: c.thresholds,
            })),
            // Draw starting hand from spellbook
            hand: spellbook.slice(0, PLAYER_STARTING_HAND_SIZE).map(c => ({
              cardId: c.cardId,
              name: c.name,
              type: c.type,
              slug: c.slug,
              cost: c.cost,
              attack: c.attack,
              defence: c.defence,
              thresholds: c.thresholds,
            })),
          };
        }
      }

      // Update players in store
      useAotreStore.setState({ players: enhancedPlayers });

      // Recalculate mana from sites
      useAotreStore.getState().recalculateMana();

    } catch (error) {
      console.error("Failed to load cards:", error);
      setLoadError("Failed to load cards. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [playerCount, difficulty]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-gray-800 to-black p-8">
      <div className="w-full max-w-2xl">
        {/* Title */}
        <div className="mb-12 text-center">
          <h1 className="mb-2 text-4xl font-bold text-red-500">
            Attack of the Realm Eater
          </h1>
          <p className="text-lg text-gray-400">
            A solo/co-op mode for Sorcery: Contested Realm
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Based on the variant by{" "}
            <a
              href="https://codeberg.org/OOPMan/attack-of-the-realm-eater"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
            >
              OOPMan
            </a>
          </p>
        </div>

        {/* Player Count Selection */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Number of Players
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {([1, 2, 3, 4] as const).map((count) => (
              <button
                key={count}
                onClick={() => setPlayerCount(count)}
                disabled={isLoading}
                className={`rounded-lg border-2 p-4 text-center transition-all ${
                  playerCount === count
                    ? "border-red-500 bg-red-500/20 text-white"
                    : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
                } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="text-3xl font-bold">{count}</div>
                <div className="mt-1 text-sm">
                  {count === 1 ? "Solo" : `${count} Players`}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {BOARD_CONFIGS[count].size.w}×{BOARD_CONFIGS[count].size.h}{" "}
                  board
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty Selection */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-white">Difficulty</h2>
          <div className="grid grid-cols-3 gap-4">
            {(["easy", "normal", "hard"] as const).map((diff) => {
              const config = DIFFICULTY_CONFIG[diff];
              return (
                <button
                  key={diff}
                  onClick={() => setDifficulty(diff)}
                  disabled={isLoading}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    difficulty === diff
                      ? "border-red-500 bg-red-500/20 text-white"
                      : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500"
                  } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="text-lg font-semibold capitalize">{diff}</div>
                  <div className="mt-1 text-sm text-gray-400">
                    {config.description}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Health: {Math.round(config.healthMultiplier * 100)}%
                    <br />
                    Spawn rate: {config.spawnCooldown} turns
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Game Info */}
        <div className="mb-8 rounded-lg bg-gray-800/50 p-4">
          <h3 className="mb-2 font-semibold text-white">How to Play</h3>
          <ul className="space-y-1 text-sm text-gray-400">
            <li>
              • The Realm starts fully built with sites on every square
            </li>
            <li>
              • All players share one Mana Pool from all sites
            </li>
            <li>
              • Players take interleaved single actions during their turn
            </li>
            <li>
              • The Realm Eater moves across the board, consuming sites
            </li>
            <li>
              • Defeat the Realm Eater before all sites are destroyed!
            </li>
          </ul>
        </div>

        {/* Error Message */}
        {loadError && (
          <div className="mb-4 rounded-lg bg-red-900/50 p-3 text-center text-red-300">
            {loadError}
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartGame}
          disabled={isLoading}
          className={`w-full rounded-lg py-4 text-xl font-bold text-white transition-colors ${
            isLoading
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-500"
          }`}
        >
          {isLoading ? "Loading Cards..." : "Start Game"}
        </button>

        {/* Back to main menu */}
        <a
          href="/play"
          className="mt-4 block text-center text-gray-500 hover:text-gray-400"
        >
          ← Back to Play Menu
        </a>
      </div>
    </div>
  );
}

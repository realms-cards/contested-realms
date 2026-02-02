"use client";

/**
 * Attack of the Realm Eater - Game End Overlay
 *
 * Victory or defeat screen shown when the game ends
 */

interface GameEndOverlayProps {
  playersWon: boolean;
  reason: string;
  onPlayAgain: () => void;
}

export function GameEndOverlay({
  playersWon,
  reason,
  onPlayAgain,
}: GameEndOverlayProps) {
  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center p-8 ${
        playersWon
          ? "bg-gradient-to-b from-green-900 via-green-800 to-black"
          : "bg-gradient-to-b from-red-900 via-red-800 to-black"
      }`}
    >
      <div className="text-center">
        {/* Result */}
        <h1
          className={`mb-4 text-6xl font-bold ${
            playersWon ? "text-green-400" : "text-red-400"
          }`}
        >
          {playersWon ? "Victory!" : "Defeat"}
        </h1>

        {/* Reason */}
        <p className="mb-8 text-xl text-gray-300">{reason}</p>

        {/* Flavor Text */}
        <p className="mb-12 max-w-md text-gray-400">
          {playersWon
            ? "The Realm has been saved! The Realm Eater has been vanquished, and the land can begin to heal."
            : "The Realm has fallen. The Realm Eater's hunger could not be stopped, and the void has consumed all."}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-4">
          <button
            onClick={onPlayAgain}
            className={`rounded-lg px-8 py-4 text-xl font-bold text-white transition-colors ${
              playersWon
                ? "bg-green-600 hover:bg-green-500"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            Play Again
          </button>

          <a
            href="/play"
            className="text-gray-400 hover:text-gray-300"
          >
            Return to Main Menu
          </a>
        </div>
      </div>
    </div>
  );
}

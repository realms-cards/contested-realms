"use client";

/**
 * Attack of the Realm Eater - Main Game Component
 *
 * Container component that manages game flow between setup, gameplay, and end screens
 * Uses angled 3D view with orbit controls for immersive gameplay
 */

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useState, useCallback, Suspense } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import CardPreview from "@/components/game/CardPreview";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import { useAotreStore } from "@/lib/aotre/store";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import { useZoomKeyboardShortcuts } from "@/lib/hooks/useZoomKeyboardShortcuts";
import { AotreBoard } from "./AotreBoard";
import { GameEndOverlay } from "./GameEndOverlay";
import { PlayerActionPrompt } from "./PlayerActionPrompt";
import { RealmEaterStatus } from "./RealmEaterStatus";
import { SetupScreen } from "./SetupScreen";
import { SharedManaDisplay } from "./SharedManaDisplay";

/**
 * Keyboard pan/zoom controls - matches main game implementation
 * Uses useThree() to get controls from R3F context (requires makeDefault on OrbitControls)
 */
function AotreKeyboardControls() {
  const { controls } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled: true, panStep: 0.8 });
  useZoomKeyboardShortcuts(controls, { enabled: true });
  return null;
}

/**
 * Camera controls with smooth keyboard support (WASD/arrow keys, +/- zoom, Q/E tilt)
 */
function AotreCameraControls({ cameraDistance }: { cameraDistance: number }) {
  return (
    <>
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={cameraDistance + 5}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.45}
        dampingFactor={0.05}
        enableDamping={true}
        zoomSpeed={0.6}
      />
      <AotreKeyboardControls />
    </>
  );
}

export function RealmEaterGame() {
  const phase = useAotreStore((s) => s.phase);
  const gameEnded = useAotreStore((s) => s.gameEnded);
  const playersWon = useAotreStore((s) => s.playersWon);
  const endReason = useAotreStore((s) => s.endReason);
  const resetGame = useAotreStore((s) => s.resetGame);
  const boardSize = useAotreStore((s) => s.boardSize);

  // Card preview state
  const [previewCard, setPreviewCard] = useState<CardPreviewData | null>(null);

  // Handle card hover for preview
  const handleCardHover = useCallback((card: CardPreviewData | null) => {
    setPreviewCard(card);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to go back to setup
      if (e.key === "Escape" && phase !== "Setup") {
        if (confirm("Return to setup screen? Current game will be lost.")) {
          resetGame();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, resetGame]);

  // Render based on current phase
  if (phase === "Setup") {
    return <SetupScreen />;
  }

  if (gameEnded) {
    return (
      <GameEndOverlay
        playersWon={playersWon ?? false}
        reason={endReason ?? "Game ended"}
        onPlayAgain={resetGame}
      />
    );
  }

  // Calculate camera position for angled 3D view
  const boardDiagonal = Math.sqrt(boardSize.w ** 2 + boardSize.h ** 2);
  const cameraDistance = boardDiagonal * 0.8 + 3;
  const cameraHeight = cameraDistance * 0.7;
  const cameraZ = cameraDistance * 0.6;

  // Main gameplay screen - maximized board, polished UI
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-b from-gray-950 via-gray-900 to-black">
      {/* Header bar - glass effect */}
      <header className="absolute left-0 right-0 top-0 z-20 flex h-14 items-center justify-between bg-black/60 backdrop-blur-md px-4 border-b border-white/5">
        <div className="flex items-center gap-4">
          {/* Logo/Title */}
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
            <h1 className="font-fantaisie text-lg text-red-400 tracking-wide">
              Attack of the Realm Eater
            </h1>
          </div>
        </div>

        {/* Mana display - right side of header */}
        <SharedManaDisplay compact />
      </header>

      {/* Main game area - 3D board with angled view */}
      <main className="absolute inset-0 pt-14 pb-36">
        <ClientCanvas
          camera={{
            position: [0, cameraHeight, cameraZ],
            fov: 45,
            near: 0.1,
            far: 100,
          }}
          shadows
        >
          <AotreBoard onCardHover={handleCardHover} />
          <Suspense fallback={null}>
            <AotreCameraControls cameraDistance={cameraDistance} />
          </Suspense>
        </ClientCanvas>
      </main>

      {/* Card preview - top right corner */}
      <CardPreview card={previewCard} anchor="top-right" zIndexClass="z-30" />

      {/* Realm Eater status panel (left side) */}
      <aside className="absolute left-3 top-16 z-10 w-52">
        <RealmEaterStatus compact />
      </aside>

      {/* Player action prompt (bottom) */}
      <footer className="absolute bottom-0 left-0 right-0 z-10">
        <PlayerActionPrompt onCardHover={handleCardHover} />
      </footer>

      {/* Back to setup button - glass style */}
      <button
        onClick={() => {
          if (confirm("Return to setup screen? Current game will be lost.")) {
            resetGame();
          }
        }}
        className="absolute right-3 top-16 z-10 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-black/70 ring-1 ring-white/10 transition-all"
      >
        <span>←</span>
        <span>Setup</span>
      </button>
    </div>
  );
}

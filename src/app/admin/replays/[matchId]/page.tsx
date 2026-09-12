"use client";

import { OrbitControls } from "@react-three/drei";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import CardPreview from "@/components/game/CardPreview";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import OnlineConsole from "@/components/game/OnlineConsole";
import OnlineLifeCounters from "@/components/game/OnlineLifeCounters";
import PlayerResourcePanels from "@/components/game/PlayerResourcePanel";
import {
  DynamicBoard as Board,
  DynamicHand3D as Hand3D,
  DynamicPiles3D as Piles3D,
} from "@/components/game/dynamic-3d";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import TextureCache from "@/lib/game/components/TextureCache";
import { Physics } from "@/lib/game/physics";
import { useGameStore } from "@/lib/game/store";

interface MatchRecording {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  initialState: {
    playerIds: string[];
    seed: string;
    matchType: string;
    playerDecks?: Record<string, unknown>;
  };
  actions: Array<{
    patch: unknown;
    timestamp: number;
    playerId: string;
  }>;
}

export default function AdminBotReplayViewerPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params?.matchId as string;

  const [recording, setRecording] = useState<MatchRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Replay controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [chatInput, setChatInput] = useState("");
  const previewCard = useGameStore((s) => s.previewCard);
  const contextMenu = useGameStore((s) => s.contextMenu);

  // Load the recording via HTTP API
  useEffect(() => {
    if (!matchId) return;

    const loadRecording = async () => {
      try {
        const res = await fetch(`/api/admin/replays/bots/${matchId}`);
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to load replay: ${res.status} ${errorText}`);
        }
        const data = (await res.json()) as MatchRecording;
        setRecording(data);
        // Initialize game state and set grid view for replays (no custom playmats)
        const store = useGameStore.getState();
        store.resetGameState();
        store.clearSnapshotsForNewMatch();
        // Use grid overlay instead of playmat for spectator/replay view
        useGameStore.setState({ showPlaymat: false, showPlaymatOverlay: true });
        setLoading(false);
      } catch (err) {
        console.error("Failed to load bot replay:", err);
        setError(err instanceof Error ? err.message : "Failed to load replay");
        setLoading(false);
      }
    };

    loadRecording();
  }, [matchId]);

  // Playback engine
  const applyAction = useCallback(
    (actionIndex: number) => {
      if (
        !recording ||
        actionIndex < 0 ||
        actionIndex >= recording.actions.length
      )
        return;

      const action = recording.actions[actionIndex];
      useGameStore.getState().applyPatch(action.patch);
      setCurrentActionIndex(actionIndex);
    },
    [recording]
  );

  const stepForward = useCallback(() => {
    if (!recording) return;
    const nextIndex = Math.min(
      currentActionIndex + 1,
      recording.actions.length - 1
    );
    applyAction(nextIndex);
  }, [recording, currentActionIndex, applyAction]);

  const stepBackward = useCallback(() => {
    if (!recording) return;
    // Reset to beginning and replay up to previous action
    useGameStore.getState().resetGameState();
    useGameStore.setState({ showPlaymat: false, showPlaymatOverlay: true });
    const prevIndex = Math.max(currentActionIndex - 1, 0);
    for (let i = 0; i <= prevIndex; i++) {
      const action = recording.actions[i];
      useGameStore.getState().applyPatch(action.patch);
    }
    setCurrentActionIndex(prevIndex);
  }, [recording, currentActionIndex]);

  const jumpToAction = useCallback(
    (targetIndex: number) => {
      if (!recording) return;
      useGameStore.getState().resetGameState();
      useGameStore.setState({ showPlaymat: false, showPlaymatOverlay: true });
      for (let i = 0; i <= targetIndex; i++) {
        const action = recording.actions[i];
        useGameStore.getState().applyPatch(action.patch);
      }
      setCurrentActionIndex(targetIndex);
    },
    [recording]
  );

  // Auto-playback with realistic timing based on action timestamps
  useEffect(() => {
    if (!isPlaying || !recording) return;

    if (currentActionIndex >= recording.actions.length - 1) {
      setIsPlaying(false);
      return;
    }

    // Calculate delay based on actual timestamps between actions
    const currentAction = recording.actions[currentActionIndex];
    const nextAction = recording.actions[currentActionIndex + 1];

    let delay: number;
    if (currentAction && nextAction) {
      // Use actual time difference between actions, scaled by playback speed
      const timeDiff = nextAction.timestamp - currentAction.timestamp;
      // Clamp to reasonable bounds: min 200ms, max 3000ms (before speed adjustment)
      const clampedDiff = Math.max(200, Math.min(3000, timeDiff));
      delay = clampedDiff / playbackSpeed;
    } else {
      // Fallback to fixed delay
      delay = 800 / playbackSpeed;
    }

    // Minimum delay to ensure smooth visual transitions
    const minDelay = 150 / playbackSpeed;
    delay = Math.max(minDelay, delay);

    const timer = setTimeout(() => {
      stepForward();
    }, delay);

    return () => clearTimeout(timer);
  }, [isPlaying, recording, currentActionIndex, playbackSpeed, stepForward]);

  const formatTime = (timestamp: number) => {
    if (!recording) return "0:00";
    const elapsed = timestamp - recording.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="rc-app flex min-h-screen items-center justify-center px-4">
        <div className="rc-hint">loading bot replay…</div>
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="rc-app flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <PageHeader
            eyebrow="admin"
            size="md"
            title="Bot replay"
            description="The recording could not be loaded."
          />
          <div className="rc-alert" data-tone="danger">
            {error || "Recording not found"}
          </div>
          <RcButton
            variant="outline"
            onClick={() => router.push("/admin/training")}
          >
            Back to Training Dashboard
          </RcButton>
        </div>
      </div>
    );
  }

  const currentAction = recording.actions[currentActionIndex];
  const progress =
    recording.actions.length > 0
      ? (currentActionIndex / (recording.actions.length - 1)) * 100
      : 0;

  return (
    <div className="rc-app fixed inset-0 h-[100dvh] w-screen">
      {/* Admin Badge */}
      <div className="absolute left-4 top-4 z-50">
        <Badge tone="gold">Admin View · Bot Replay</Badge>
      </div>

      {/* 3D Game View */}
      <div className="absolute inset-0 w-full h-full">
        <ClientCanvas
          camera={{ position: [0, 10, 0], fov: 50 }}
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
        >
          <color attach="background" args={["#0b0b0c"]} />
          <ambientLight intensity={0.8} />
          <directionalLight
            position={[10, 12, 8]}
            intensity={1.35}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={50}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={15}
            shadow-camera-bottom={-15}
            shadow-bias={-0.0005}
          />

          <Physics gravity={[0, -9.81, 0]}>
            <Board interactionMode="spectator" enableBoardPings={false} />
            {/* Commentator-style hands for replay: both players, face-up, flat, at edges */}
            <Hand3D
              owner="p1"
              matW={1}
              matH={1}
              viewerPlayerNumber={1}
              placement="edgeBottom"
              showCardBacks={false}
              flatCards
            />
            <Hand3D
              owner="p2"
              matW={1}
              matH={1}
              viewerPlayerNumber={1}
              placement="edgeTop"
              showCardBacks={false}
              flatCards
            />

            {/* Player piles: spellbook, atlas, graveyard, collection (read-only in replay) */}
            <Piles3D owner="p1" matW={1} matH={1} noRaycast />
            <Piles3D owner="p2" matW={1} matH={1} noRaycast />

            <TextureCache />
          </Physics>

          <OrbitControls
            makeDefault
            target={[0, 0, 0]}
            enablePan
            enableRotate
            enableZoom
            enableDamping
            dampingFactor={0.08}
            screenSpacePanning
            panSpeed={1.2}
            zoomSpeed={0.75}
            minDistance={1}
            maxDistance={36}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2.05}
          />
        </ClientCanvas>
      </div>

      {previewCard?.slug && !contextMenu && (
        <CardPreview
          card={{
            slug: previewCard.slug ?? "",
            name: previewCard.name,
            type: previewCard.type ?? null,
          }}
          anchor="top-right"
          zIndexClass="z-30"
        />
      )}

      {/* Life Counters */}
      <OnlineLifeCounters
        dragFromHand={false}
        myPlayerKey={null}
        playerNames={{
          p1: recording.playerNames[0] || "Player 1",
          p2: recording.playerNames[1] || "Player 2",
        }}
        readOnly={true}
      />

      {/* Mana and Thresholds panel on the right */}
      <PlayerResourcePanels
        myPlayerKey={null}
        playerNames={{
          p1: recording.playerNames[0] || "Player 1",
          p2: recording.playerNames[1] || "Player 2",
        }}
        readOnly={true}
        dragFromHand={false}
      />

      {/* Replay Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-rc-line/18 bg-black/80 p-4 backdrop-blur-[6px]">
        <div className="mx-auto max-w-6xl">
          {/* Match Info */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                {recording.playerNames.join(" vs ")}
              </div>
              <div className="rc-hint mt-1">
                {recording.initialState.matchType} · {recording.actions.length}{" "}
                actions · bot match
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RcButton
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(recording, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const safeName = recording.playerNames
                    .join("_vs_")
                    .replace(/[^a-zA-Z0-9_-]/g, "");
                  const date = new Date(recording.startTime)
                    .toISOString()
                    .split("T")[0];
                  a.download = `bot_replay_${safeName}_${date}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                title="Download Replay"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="M12 16l-6-6h4V4h4v6h4l-6 6zm-8 2h16v2H4v-2z" />
                </svg>
              </RcButton>
              <RcButton
                variant="outline"
                size="sm"
                onClick={() => router.push("/admin/training")}
              >
                Back to Training Dashboard
              </RcButton>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-fg-subtle">
              <span>
                Action {currentActionIndex + 1} of {recording.actions.length}
              </span>
              <span>
                {currentAction ? formatTime(currentAction.timestamp) : "0:00"}
              </span>
            </div>
            <div className="relative">
              <div className="rc-progress">
                <span style={{ width: `${progress}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={recording.actions.length - 1}
                value={currentActionIndex}
                onChange={(e) => jumpToAction(parseInt(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <RcButton
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => jumpToAction(0)}
              title="Jump to Start"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M6 6h2v12H6V6zm12 6-8 6V6l8 6z" />
              </svg>
            </RcButton>
            <RcButton
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={stepBackward}
              title="Step Backward"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M6 5h2v14H6V5zm12 7-9 6V6l9 6z" />
              </svg>
            </RcButton>
            <RcButton
              size="sm"
              className="h-9 px-4"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                  >
                    <path d="M8 6h3v12H8V6zm5 0h3v12h-3V6z" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                  >
                    <path d="M8 5v14l11-7-11-7z" />
                  </svg>
                  Play
                </>
              )}
            </RcButton>
            <RcButton
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={stepForward}
              title="Step Forward"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M7 6h3v12H7V6zm4 6 9 6V6l-9 6z" />
              </svg>
            </RcButton>
            <RcButton
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => jumpToAction(recording.actions.length - 1)}
              title="Jump to End"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M16 6h2v12h-2V6zM6 12l8-6v12l-8-6z" />
              </svg>
            </RcButton>

            {/* Speed Control */}
            <div className="ml-4 flex items-center gap-2">
              <span className="rc-eyebrow">Speed</span>
              <CustomSelect
                value={String(playbackSpeed)}
                onChange={(v) => setPlaybackSpeed(parseFloat(v))}
                options={[
                  { value: "0.5", label: "0.5x" },
                  { value: "1", label: "1x" },
                  { value: "2", label: "2x" },
                  { value: "4", label: "4x" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Event/Chat Console */}
      <OnlineConsole
        dragFromHand={false}
        chatLog={[]}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendChat={() => {}}
        onLeaveMatch={() => router.push("/admin/training")}
        connected={true}
        myPlayerId={undefined}
        hideLeaveButton={true}
        defaultOpen={true}
        hideChat={true}
        position="top-left"
      />
    </div>
  );
}

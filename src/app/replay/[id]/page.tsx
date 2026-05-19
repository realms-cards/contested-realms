"use client";

import { OrbitControls } from "@react-three/drei";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

function ShareButton({ matchId }: { matchId: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    const url = `${window.location.origin}/replay/${matchId}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleShare}
      className="h-9 w-9 grid place-items-center bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
      title={copied ? "Copied!" : "Copy share link"}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-emerald-400">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
        </svg>
      )}
    </button>
  );
}

export default function ReplayViewerPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params?.id as string;

  const [recording, setRecording] = useState<MatchRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedMatchIdRef = useRef<string | null>(null);

  // Replay controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [chatInput, setChatInput] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewCard = useGameStore((s) => s.previewCard);
  const contextMenu = useGameStore((s) => s.contextMenu);

  // Load the recording via public HTTP API
  useEffect(() => {
    if (!matchId) return;
    if (loadedMatchIdRef.current === matchId) return;

    setLoading(true);
    setError(null);
    setRecording(null);
    setIsPlaying(false);
    setCurrentActionIndex(0);

    let cancelled = false;

    void fetch(`/api/replays/${encodeURIComponent(matchId)}`)
      .then((res) => res.json())
      .then((data: { recording?: MatchRecording; error?: string }) => {
        if (cancelled) return;
        if (data.error || !data.recording) {
          setError(data.error ?? "Recording not found");
        } else {
          loadedMatchIdRef.current = data.recording.matchId;
          setRecording(data.recording);
          const store = useGameStore.getState();
          store.resetGameState();
          store.clearSnapshotsForNewMatch();
          useGameStore.setState({ showPlaymat: false, showPlaymatOverlay: true });
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load replay");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
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

  // Auto-hide controls when playing and no mouse activity
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 2500);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showControls();
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying, showControls]);

  const formatTime = useCallback((timestamp: number) => {
    if (!recording) return "0:00";
    const elapsed = timestamp - recording.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [recording]);

  const currentTimeLabel = useMemo(
    () => (recording?.actions[currentActionIndex] ? formatTime(recording.actions[currentActionIndex].timestamp) : "0:00"),
    [recording, currentActionIndex, formatTime]
  );

  if (loading && !recording) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading replay...</div>
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-xl mb-4">Error loading replay</div>
          <div className="text-slate-400 mb-4">
            {error || "Recording not found"}
          </div>
          <button
            onClick={() => router.push("/replay")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Back to Replays
          </button>
        </div>
      </div>
    );
  }

  const progress =
    recording.actions.length > 0
      ? (currentActionIndex / (recording.actions.length - 1)) * 100
      : 0;

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-slate-900" onMouseMove={showControls}>
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
            // Full orbit controls for replay viewing
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

      {/* Replay Controls — minimal, auto-hides while playing */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Scrubber — sits at the very bottom edge */}
        <div className="group relative h-5 flex items-end px-0 cursor-pointer">
          <div className="absolute inset-x-0 bottom-0 h-1 group-hover:h-[5px] transition-all duration-150 bg-white/10 rounded-none">
            <div
              className="h-full bg-blue-500 rounded-none transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={recording.actions.length - 1}
            value={currentActionIndex}
            onChange={(e) => {
              setIsPlaying(false);
              jumpToAction(parseInt(e.target.value));
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Control bar */}
        <div className="flex items-center gap-1 px-3 py-2 bg-gradient-to-t from-black/70 to-black/0 backdrop-blur-[2px]">
          {/* Left: back + title */}
          <button
            onClick={() => router.push("/replay")}
            className="h-7 w-7 grid place-items-center rounded text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title="Back to Replays"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>

          <span className="text-xs text-slate-300 truncate max-w-[180px] flex-shrink-0 mr-1">
            {recording.playerNames.join(" vs ")}
          </span>

          <span className="text-[10px] text-slate-500 flex-shrink-0 mr-2">
            {recording.initialState.matchType}
          </span>

          {/* Playback controls — centered */}
          <div className="flex items-center gap-1 flex-1 justify-center">
            <button
              onClick={() => { setIsPlaying(false); jumpToAction(0); }}
              className="h-7 w-7 grid place-items-center rounded text-slate-400 hover:text-white transition-colors"
              title="Jump to Start"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M6 6h2v12H6V6zm12 6-8 6V6l8 6z" />
              </svg>
            </button>
            <button
              onClick={stepBackward}
              className="h-7 w-7 grid place-items-center rounded text-slate-400 hover:text-white transition-colors"
              title="Step Backward"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M6 5h2v14H6V5zm12 7-9 6V6l9 6z" />
              </svg>
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="h-8 w-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M8 6h3v12H8V6zm5 0h3v12h-3V6z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M8 5v14l11-7-11-7z" />
                </svg>
              )}
            </button>
            <button
              onClick={stepForward}
              className="h-7 w-7 grid place-items-center rounded text-slate-400 hover:text-white transition-colors"
              title="Step Forward"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M7 6h3v12H7V6zm4 6 9 6V6l-9 6z" />
              </svg>
            </button>
            <button
              onClick={() => { setIsPlaying(false); jumpToAction(recording.actions.length - 1); }}
              className="h-7 w-7 grid place-items-center rounded text-slate-400 hover:text-white transition-colors"
              title="Jump to End"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M16 6h2v12h-2V6zM6 12l8-6v12l-8-6z" />
              </svg>
            </button>
          </div>

          {/* Right: time + speed + share + download */}
          <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
            {currentActionIndex + 1}/{recording.actions.length} · {currentTimeLabel}
          </span>

          <div className="ml-1 flex-shrink-0">
            <CustomSelect
              value={String(playbackSpeed)}
              onChange={(v) => setPlaybackSpeed(parseFloat(v))}
              options={[
                { value: "0.5", label: "0.5×" },
                { value: "1", label: "1×" },
                { value: "2", label: "2×" },
                { value: "4", label: "4×" },
              ]}
            />
          </div>

          <ShareButton matchId={recording.matchId} />

          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(recording, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const safeName = recording.playerNames.join("_vs_").replace(/[^a-zA-Z0-9_-]/g, "");
              const date = new Date(recording.startTime).toISOString().split("T")[0];
              a.download = `replay_${safeName}_${date}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="h-7 w-7 grid place-items-center rounded text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title="Download Replay"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 16l-6-6h4V4h4v6h4l-6 6zm-8 2h16v2H4v-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Event/Chat Console */}
      <OnlineConsole
        dragFromHand={false}
        chatLog={[]}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendChat={() => {}}
        onLeaveMatch={() => router.push("/replay")}
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

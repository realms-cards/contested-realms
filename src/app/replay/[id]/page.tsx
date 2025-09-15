"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import OnlineConsole from "@/components/game/OnlineConsole";
import Board from "@/lib/game/Board";
import TextureCache from "@/lib/game/components/TextureCache";
import { useGameStore } from "@/lib/game/store";
import { SocketTransport } from "@/lib/net/socketTransport";

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

export default function ReplayViewerPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params?.id as string;
  
  const [transport, setTransport] = useState<SocketTransport | null>(null);
  const [connected, setConnected] = useState(false);
  const { data: session } = useSession();
  
  const [recording, setRecording] = useState<MatchRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Replay controls
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [chatInput, setChatInput] = useState("");

  // Setup socket connection
  useEffect(() => {
    const socketTransport = new SocketTransport();
    setTransport(socketTransport);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    // Connect first, then set up event listeners
    const displayName = (session?.user?.name && String(session.user.name).trim()) || `Replay_${Date.now()}`;
    const playerId = (session?.user && (session.user as { id?: string }).id) || `replay_viewer_${Date.now()}`;
    socketTransport.connect({
      displayName,
      playerId,
    }).then(() => {
      // Set up event listeners after connection is established
      socketTransport.onGeneric("connect", handleConnect);
      socketTransport.onGeneric("disconnect", handleDisconnect);
      setConnected(true);
    }).catch((error) => {
      console.error("Failed to connect to replay server:", error);
      setLoading(false);
      setError("Failed to connect to server");
    });

    return () => {
      try {
        if (socketTransport) {
          socketTransport.offGeneric("connect", handleConnect);
          socketTransport.offGeneric("disconnect", handleDisconnect);
          socketTransport.disconnect();
        }
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [session]);

  // Load the recording
  useEffect(() => {
    if (!connected || !transport || !matchId) return;

    const handleRecording = (payload: unknown) => {
      const data = payload as { recording?: MatchRecording; error?: string };
      if (data.error) {
        setError(data.error);
      } else if (data.recording) {
        setRecording(data.recording);
        // Initialize game state
        useGameStore.getState().resetGameState();
      }
      setLoading(false);
    };

    transport.onGeneric("matchRecordingResponse", handleRecording);
    transport.emit("getMatchRecording", { matchId });

    return () => {
      if (transport) {
        transport.offGeneric("matchRecordingResponse", handleRecording);
      }
    };
  }, [connected, transport, matchId]);

  // Playback engine
  const applyAction = useCallback((actionIndex: number) => {
    if (!recording || actionIndex < 0 || actionIndex >= recording.actions.length) return;
    
    const action = recording.actions[actionIndex];
    useGameStore.getState().applyPatch(action.patch);
    setCurrentActionIndex(actionIndex);
  }, [recording]);

  const stepForward = useCallback(() => {
    if (!recording) return;
    const nextIndex = Math.min(currentActionIndex + 1, recording.actions.length - 1);
    applyAction(nextIndex);
  }, [recording, currentActionIndex, applyAction]);

  const stepBackward = useCallback(() => {
    if (!recording) return;
    // Reset to beginning and replay up to previous action
    useGameStore.getState().resetGameState();
    const prevIndex = Math.max(currentActionIndex - 1, 0);
    for (let i = 0; i <= prevIndex; i++) {
      const action = recording.actions[i];
      useGameStore.getState().applyPatch(action.patch);
    }
    setCurrentActionIndex(prevIndex);
  }, [recording, currentActionIndex]);

  const jumpToAction = useCallback((targetIndex: number) => {
    if (!recording) return;
    useGameStore.getState().resetGameState();
    for (let i = 0; i <= targetIndex; i++) {
      const action = recording.actions[i];
      useGameStore.getState().applyPatch(action.patch);
    }
    setCurrentActionIndex(targetIndex);
  }, [recording]);

  // Auto-playback
  useEffect(() => {
    if (!isPlaying || !recording) return;
    
    const interval = setInterval(() => {
      if (currentActionIndex >= recording.actions.length - 1) {
        setIsPlaying(false);
        return;
      }
      stepForward();
    }, 1000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, recording, currentActionIndex, playbackSpeed, stepForward]);

  const formatTime = (timestamp: number) => {
    if (!recording) return "0:00";
    const elapsed = timestamp - recording.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Connecting...</div>
      </div>
    );
  }

  if (loading) {
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
          <div className="text-slate-400 mb-4">{error || "Recording not found"}</div>
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

  const currentAction = recording.actions[currentActionIndex];
  const progress = recording.actions.length > 0 ? (currentActionIndex / (recording.actions.length - 1)) * 100 : 0;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-900">
      {/* 3D Game View */}
      <div className="absolute inset-0 w-full h-full">
        <Canvas
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
          />

          <Physics gravity={[0, -9.81, 0]}>
            <Board />
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
        </Canvas>
      </div>

      {/* Replay Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm p-4">
        <div className="max-w-6xl mx-auto">
          {/* Match Info */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-white">
              <div className="font-semibold text-lg">
                {recording.playerNames.join(" vs ")}
              </div>
              <div className="text-sm text-slate-400">
                {recording.initialState.matchType} • {recording.actions.length} actions
              </div>
            </div>
            <button
              onClick={() => router.push("/replay")}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
            >
              Back to Replays
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
              <span>Action {currentActionIndex + 1} of {recording.actions.length}</span>
              <span>{currentAction ? formatTime(currentAction.timestamp) : "0:00"}</span>
            </div>
            <div className="relative bg-slate-700 h-2 rounded-full">
              <div 
                className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
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
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => jumpToAction(0)}
              className="h-9 w-9 grid place-items-center bg-slate-700 hover:bg-slate-600 rounded text-white transition-colors"
              title="Jump to Start"
            >
              {/* Skip back icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M6 6h2v12H6V6zm12 6-8 6V6l8 6z"/></svg>
            </button>
            <button
              onClick={stepBackward}
              className="h-9 w-9 grid place-items-center bg-slate-700 hover:bg-slate-600 rounded text-white transition-colors"
              title="Step Backward"
            >
              {/* Step back icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M6 5h2v14H6V5zm12 7-9 6V6l9 6z"/></svg>
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="h-9 px-4 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors font-semibold flex items-center gap-2"
              >
              {isPlaying ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M8 6h3v12H8V6zm5 0h3v12h-3V6z"/></svg>
                  Pause
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M8 5v14l11-7-11-7z"/></svg>
                  Play
                </>
              )}
            </button>
            <button
              onClick={stepForward}
              className="h-9 w-9 grid place-items-center bg-slate-700 hover:bg-slate-600 rounded text-white transition-colors"
              title="Step Forward"
            >
              {/* Step forward icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M7 6h3v12H7V6zm4 6 9 6V6l-9 6z"/></svg>
            </button>
            <button
              onClick={() => jumpToAction(recording.actions.length - 1)}
              className="h-9 w-9 grid place-items-center bg-slate-700 hover:bg-slate-600 rounded text-white transition-colors"
              title="Jump to End"
            >
              {/* Skip forward icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M16 6h2v12h-2V6zM6 12l8-6v12l-8-6z"/></svg>
            </button>
            
            {/* Speed Control */}
            <div className="ml-4 flex items-center gap-2">
              <span className="text-sm text-slate-400">Speed:</span>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
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
        onLeaveMatch={() => router.push('/replay')}
        connected={true}
        myPlayerId={undefined}
        hideLeaveButton={true}
        defaultOpen={true}
        hideChat={true}
        position="top-right"
      />
    </div>
  );
}

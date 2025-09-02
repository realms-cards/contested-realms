"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SocketTransport } from "@/lib/net/socketTransport";

interface MatchRecordingSummary {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  duration?: number;
  actionCount: number;
  matchType: string;
  playerIds?: string[];
}

export default function ReplayListPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<MatchRecordingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [transport, setTransport] = useState<SocketTransport | null>(null);
  const [connected, setConnected] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  

  useEffect(() => {
    // Get current player ID from localStorage if available
    try {
      const storedPlayerId = localStorage.getItem("sorcery:playerId");
      setCurrentPlayerId(storedPlayerId);
    } catch {
      // Ignore localStorage errors
    }

    const socketTransport = new SocketTransport();
    setTransport(socketTransport);

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    // Connect first, then set up event listeners
    socketTransport
      .connect({
        displayName: `Replay_${Date.now()}`, // Make it clear it's not a real player
        playerId: `replay_viewer_${Date.now()}`,
      })
      .then(() => {
        // Set up event listeners after connection is established
        socketTransport.onGeneric("connect", handleConnect);
        socketTransport.onGeneric("disconnect", handleDisconnect);
        setConnected(true);
      })
      .catch((error) => {
        console.error("Failed to connect to replay server:", error);
        setLoading(false);
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
  }, []);

  useEffect(() => {
    if (!connected || !transport) return;

    const handleRecordings = (payload: unknown) => {
      const data = payload as { recordings: MatchRecordingSummary[] };
      setRecordings(data.recordings);
      setLoading(false);
    };

    transport.onGeneric("matchRecordingsResponse", handleRecordings);
    transport.emit("getMatchRecordings");

    return () => {
      if (transport) {
        transport.offGeneric("matchRecordingsResponse", handleRecordings);
      }
    };
  }, [connected, transport]);

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (timestamp: number) => {
    return (
      new Date(timestamp).toLocaleDateString() +
      " " +
      new Date(timestamp).toLocaleTimeString()
    );
  };

  // Separate recordings into own matches and others' matches
  const ownRecordings = recordings.filter((recording) =>
    recording.playerIds?.includes(currentPlayerId || "")
  );
  const otherRecordings = recordings.filter(
    (recording) => !recording.playerIds?.includes(currentPlayerId || "")
  );

  if (!connected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Connecting...</div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-fantaisie">Match Replays</h1>
          <button
            onClick={() => router.push("/online/lobby")}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Back to Online
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-lg">Loading recordings...</div>
          </div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-lg text-slate-400">
              No match recordings found
            </div>
            <div className="text-sm text-slate-500 mt-2">
              Play some online matches to generate replays!
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Own Matches Section */}
            {ownRecordings.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-white">
                  Your Matches
                </h2>
                <div className="grid gap-4">
                  {ownRecordings.map((recording) => (
                    <div
                      key={recording.matchId}
                      className="bg-slate-800 rounded-lg p-4 hover:bg-slate-750 transition-colors cursor-pointer ring-1 ring-blue-500/20"
                      onClick={() =>
                        router.push(`/replay/${recording.matchId}`)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold">
                              {recording.playerNames.join(" vs ")}
                            </h3>
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                recording.matchType === "sealed"
                                  ? "bg-blue-600 text-white"
                                  : "bg-green-600 text-white"
                              }`}
                            >
                              {recording.matchType}
                            </span>
                          </div>
                          <div className="text-sm text-slate-400">
                            {formatDate(recording.startTime)}
                          </div>
                        </div>
                        <div className="text-right text-sm text-slate-400">
                          <div>
                            Duration:{" "}
                            {recording.duration
                              ? formatDuration(recording.duration)
                              : "In Progress"}
                          </div>
                          <div>Actions: {recording.actionCount}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other Matches Section */}
            {otherRecordings.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-white">
                  Other Matches
                </h2>
                <div className="grid gap-4">
                  {otherRecordings.map((recording) => (
                    <div
                      key={recording.matchId}
                      className="bg-slate-800 rounded-lg p-4 hover:bg-slate-750 transition-colors cursor-pointer"
                      onClick={() =>
                        router.push(`/replay/${recording.matchId}`)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold">
                              {recording.playerNames.join(" vs ")}
                            </h3>
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                recording.matchType === "sealed"
                                  ? "bg-blue-600 text-white"
                                  : "bg-green-600 text-white"
                              }`}
                            >
                              {recording.matchType}
                            </span>
                          </div>
                          <div className="text-sm text-slate-400">
                            {formatDate(recording.startTime)}
                          </div>
                        </div>
                        <div className="text-right text-sm text-slate-400">
                          <div>
                            Duration:{" "}
                            {recording.duration
                              ? formatDuration(recording.duration)
                              : "In Progress"}
                          </div>
                          <div>Actions: {recording.actionCount}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

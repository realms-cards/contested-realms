"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { SocketTransport } from "@/lib/net/socketTransport";

const LOCAL_REPLAY_STORAGE_KEY = "sorcery:localReplay";

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [transport, setTransport] = useState<SocketTransport | null>(null);
  const [connected, setConnected] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showOwnOnly, setShowOwnOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        // Validate the replay structure
        if (
          !parsed.matchId ||
          !parsed.playerNames ||
          !Array.isArray(parsed.actions) ||
          !parsed.initialState
        ) {
          setUploadError(
            "Invalid replay file format. Missing required fields."
          );
          return;
        }

        // Store in sessionStorage and navigate to local viewer
        sessionStorage.setItem(LOCAL_REPLAY_STORAGE_KEY, content);
        router.push("/replay/local");
      } catch {
        setUploadError(
          "Failed to parse replay file. Please ensure it's a valid JSON file."
        );
      }
    };
    reader.onerror = () => {
      setUploadError("Failed to read file.");
    };
    reader.readAsText(file);

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Get current player ID from session or localStorage if available
    try {
      const fromSession = (session?.user &&
        (session.user as { id?: string }).id) as string | undefined;
      const storedPlayerId = localStorage.getItem("sorcery:playerId");
      setCurrentPlayerId(fromSession || storedPlayerId);
    } catch {
      // Ignore localStorage errors
    }

    const socketTransport = new SocketTransport();
    setTransport(socketTransport);

    const handleConnect = () => {
      if (!isMounted) return;
      setConnected(true);
    };
    const handleDisconnect = () => {
      if (!isMounted) return;
      setConnected(false);
      setSocketReady(false);
    };

    socketTransport.onGeneric("connect", handleConnect);
    socketTransport.onGeneric("disconnect", handleDisconnect);

    const displayName =
      (session?.user?.name && String(session.user.name).trim()) ||
      `Replay_${Date.now()}`;
    const playerId =
      (session?.user && (session.user as { id?: string }).id) ||
      `replay_viewer_${Date.now()}`;
    socketTransport
      .connect({
        displayName,
        playerId,
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error("Failed to connect to replay server:", error);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      try {
        socketTransport.offGeneric("connect", handleConnect);
        socketTransport.offGeneric("disconnect", handleDisconnect);
        socketTransport.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [session]);

  // Mark socket ready on 'welcome' (post-hello auth); request recordings then
  useEffect(() => {
    if (!transport) return;
    const onWelcome = () => setSocketReady(true);
    transport.onGeneric("welcome", onWelcome);
    return () => {
      transport.offGeneric("welcome", onWelcome);
    };
  }, [transport]);

  useEffect(() => {
    if (!socketReady || !transport) return;

    const handleRecordings = (payload: unknown) => {
      const data = payload as {
        recordings: MatchRecordingSummary[];
        hasMore: boolean;
        nextCursor?: string;
      };
      setRecordings(data.recordings);
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
      setLoading(false);
    };

    transport.onGeneric("matchRecordingsResponse", handleRecordings);

    // Request recordings with optional playerId filter
    const payload: { limit?: number; playerId?: string } = { limit: 50 };
    if (showOwnOnly && currentPlayerId) {
      payload.playerId = currentPlayerId;
    }
    transport.emit("getMatchRecordings", payload);

    return () => {
      transport.offGeneric("matchRecordingsResponse", handleRecordings);
    };
  }, [socketReady, transport, showOwnOnly, currentPlayerId]);

  const loadMore = () => {
    if (!transport || !nextCursor || loadingMore) return;

    setLoadingMore(true);

    const handleMoreRecordings = (payload: unknown) => {
      const data = payload as {
        recordings: MatchRecordingSummary[];
        hasMore: boolean;
        nextCursor?: string;
      };
      setRecordings((prev) => [...prev, ...data.recordings]);
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
      setLoadingMore(false);
      transport.offGeneric("matchRecordingsResponse", handleMoreRecordings);
    };

    transport.onGeneric("matchRecordingsResponse", handleMoreRecordings);

    const payload: { limit?: number; cursor?: string; playerId?: string } = {
      limit: 50,
      cursor: nextCursor,
    };
    if (showOwnOnly && currentPlayerId) {
      payload.playerId = currentPlayerId;
    }
    transport.emit("getMatchRecordings", payload);
  };

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
      <OnlinePageShell>
        <div className="flex items-center justify-center py-32">
          <div className="text-sm text-slate-300">
            Connecting to replay service…
          </div>
        </div>
      </OnlinePageShell>
    );
  }

  return (
    <OnlinePageShell>
      <div className="space-y-6 pt-2">
        {/* Upload Replay Section */}
        <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                Load Local Replay
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Upload a previously downloaded replay file to watch it locally
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
                id="replay-upload"
              />
              <label
                htmlFor="replay-upload"
                className="h-9 w-9 grid place-items-center bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white transition-colors cursor-pointer"
                title="Upload Replay"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M12 8l6 6h-4v6h-4v-6H6l6-6zM4 4h16v2H4V4z" />
                </svg>
              </label>
            </div>
          </div>
          {uploadError && (
            <div className="mt-3 px-3 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-sm text-red-300">
              {uploadError}
            </div>
          )}
        </div>

        {/* Filter Section */}
        {currentPlayerId && (
          <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showOwnOnly}
                onChange={(e) => {
                  setShowOwnOnly(e.target.checked);
                  setRecordings([]);
                  setLoading(true);
                  setHasMore(false);
                  setNextCursor(null);
                }}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-950"
              />
              <span className="text-sm text-slate-300">
                Show only my matches
              </span>
            </label>
          </div>
        )}

        {loading ? (
          <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-5 text-center text-sm text-slate-300">
            Loading recordings…
          </div>
        ) : recordings.length === 0 ? (
          <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-8 text-center space-y-2">
            <div className="text-base font-semibold text-slate-100">
              No match recordings found.
            </div>
            <div className="text-sm text-slate-400">
              Play some online matches to generate replays!
            </div>
          </div>
        ) : showOwnOnly ? (
          <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                Your Matches
              </h2>
              <span className="text-xs text-slate-400">
                {recordings.length} replays
              </span>
            </div>
            <div className="grid gap-3">
              {recordings.map((recording) => (
                <div
                  key={recording.matchId}
                  className="bg-slate-900/60 border border-slate-800/70 rounded-xl px-4 py-4 hover:bg-slate-900/80 transition-colors cursor-pointer"
                  onClick={() => router.push(`/replay/${recording.matchId}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          {recording.playerNames.join(" vs ")}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                            recording.matchType === "sealed"
                              ? "bg-blue-500/60 text-blue-50"
                              : "bg-emerald-500/60 text-emerald-50"
                          }`}
                        >
                          {recording.matchType}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatDate(recording.startTime)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400 space-y-1">
                      <div>
                        <span className="uppercase tracking-wide text-slate-500">
                          Duration:
                        </span>{" "}
                        {recording.duration
                          ? formatDuration(recording.duration)
                          : "In Progress"}
                      </div>
                      <div>
                        <span className="uppercase tracking-wide text-slate-500">
                          Actions:
                        </span>{" "}
                        {recording.actionCount}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 px-4 bg-slate-800/60 hover:bg-slate-800 disabled:bg-slate-800/40 border border-slate-700 rounded-lg text-sm text-slate-200 disabled:text-slate-500 transition-colors"
              >
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {ownRecordings.length > 0 && (
              <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                    Your Matches
                  </h2>
                  <span className="text-xs text-slate-400">
                    {ownRecordings.length} replays
                  </span>
                </div>
                <div className="grid gap-3">
                  {ownRecordings.map((recording) => (
                    <div
                      key={recording.matchId}
                      className="bg-slate-900/60 border border-slate-800/70 rounded-xl px-4 py-4 hover:bg-slate-900/80 transition-colors cursor-pointer"
                      onClick={() =>
                        router.push(`/replay/${recording.matchId}`)
                      }
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-sm font-semibold text-slate-100">
                              {recording.playerNames.join(" vs ")}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                recording.matchType === "sealed"
                                  ? "bg-blue-500/60 text-blue-50"
                                  : "bg-emerald-500/60 text-emerald-50"
                              }`}
                            >
                              {recording.matchType}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {formatDate(recording.startTime)}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-400 space-y-1">
                          <div>
                            <span className="uppercase tracking-wide text-slate-500">
                              Duration:
                            </span>{" "}
                            {recording.duration
                              ? formatDuration(recording.duration)
                              : "In Progress"}
                          </div>
                          <div>
                            <span className="uppercase tracking-wide text-slate-500">
                              Actions:
                            </span>{" "}
                            {recording.actionCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherRecordings.length > 0 && (
              <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                    Other Matches
                  </h2>
                  <span className="text-xs text-slate-400">
                    {otherRecordings.length} replays
                  </span>
                </div>
                <div className="grid gap-3">
                  {otherRecordings.map((recording) => (
                    <div
                      key={recording.matchId}
                      className="bg-slate-900/60 border border-slate-800/70 rounded-xl px-4 py-4 hover:bg-slate-900/80 transition-colors cursor-pointer"
                      onClick={() =>
                        router.push(`/replay/${recording.matchId}`)
                      }
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-sm font-semibold text-slate-100">
                              {recording.playerNames.join(" vs ")}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                                recording.matchType === "sealed"
                                  ? "bg-blue-500/60 text-blue-50"
                                  : "bg-emerald-500/60 text-emerald-50"
                              }`}
                            >
                              {recording.matchType}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {formatDate(recording.startTime)}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-400 space-y-1">
                          <div>
                            <span className="uppercase tracking-wide text-slate-500">
                              Duration:
                            </span>{" "}
                            {recording.duration
                              ? formatDuration(recording.duration)
                              : "In Progress"}
                          </div>
                          <div>
                            <span className="uppercase tracking-wide text-slate-500">
                              Actions:
                            </span>{" "}
                            {recording.actionCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasMore && (
              <div className="rounded-xl bg-slate-950/60 ring-1 ring-slate-900/70 p-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 px-4 bg-slate-800/60 hover:bg-slate-800 disabled:bg-slate-800/40 border border-slate-700 rounded-lg text-sm text-slate-200 disabled:text-slate-500 transition-colors"
                >
                  {loadingMore ? "Loading…" : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </OnlinePageShell>
  );
}

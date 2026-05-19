"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import OnlinePageShell from "@/components/online/OnlinePageShell";

const LOCAL_REPLAY_STORAGE_KEY = "sorcery:localReplay";
let replayViewerPreloadPromise: Promise<void> | null = null;

function preloadReplayViewerModules(): Promise<void> {
  if (!replayViewerPreloadPromise) {
    replayViewerPreloadPromise = Promise.all([
      import("@/components/game/ClientCanvas"),
      import("@/lib/game/Board"),
      import("@/lib/game/components/Hand3D"),
      import("@/lib/game/components/Piles3D"),
    ]).then(() => undefined);
  }

  return replayViewerPreloadPromise;
}

interface MatchRecordingSummary {
  matchId: string;
  playerNames: string[];
  startTime: number;
  endTime?: number;
  duration?: number;
  actionCount: number;
  matchType: string;
  playerIds?: string[];
  isCpuMatch?: boolean;
}

function ShareButton({ matchId }: { matchId: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/replay/${matchId}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleShare}
      className="w-9 grid place-items-center text-slate-500 hover:text-slate-200 hover:bg-slate-700/40 transition-colors"
      title={copied ? "Copied!" : "Copy share link"}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
        </svg>
      )}
    </button>
  );
}

export default function ReplayListPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<MatchRecordingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showOwnOnly, setShowOwnOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  useEffect(() => {
    void preloadReplayViewerModules();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    try {
      const fromSession = (session?.user &&
        (session.user as { id?: string }).id) as string | undefined;
      const storedPlayerId = localStorage.getItem("sorcery:playerId");
      setCurrentPlayerId(fromSession || storedPlayerId);
    } catch {
      // ignore localStorage errors
    }
  }, [session]);

  const fetchRecordings = useCallback(
    async (cursor?: string | null) => {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      if (currentPlayerId) params.set("playerId", currentPlayerId);
      if (showOwnOnly) params.set("ownOnly", "true");

      const res = await fetch(`/api/replays?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load replays");
      return res.json() as Promise<{
        recordings: MatchRecordingSummary[];
        hasMore: boolean;
        nextCursor?: string;
      }>;
    },
    [currentPlayerId, showOwnOnly]
  );

  useEffect(() => {
    setLoading(true);
    setRecordings([]);
    setHasMore(false);
    setNextCursor(null);
    void fetchRecordings().then((data) => {
      setRecordings(data.recordings);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [fetchRecordings]);

  useEffect(() => {
    if (!recordings.length) return;
    void preloadReplayViewerModules();
    recordings.slice(0, 8).forEach((recording) => {
      router.prefetch(`/replay/${recording.matchId}`);
    });
  }, [recordings, router]);

  const openReplay = async (replayMatchId: string) => {
    const href = `/replay/${replayMatchId}`;
    router.prefetch(href);
    await preloadReplayViewerModules();
    router.push(href);
  };

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    void fetchRecordings(nextCursor).then((data) => {
      setRecordings((prev) => [...prev, ...data.recordings]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor ?? null);
      setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
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

  const renderReplayCard = (recording: MatchRecordingSummary) => (
    <div
      key={recording.matchId}
      className="bg-slate-900/60 border border-slate-800/70 rounded-xl px-4 py-4 hover:bg-slate-900/80 transition-colors cursor-pointer"
      onMouseEnter={() => {
        router.prefetch(`/replay/${recording.matchId}`);
        void preloadReplayViewerModules();
      }}
      onFocus={() => {
        router.prefetch(`/replay/${recording.matchId}`);
        void preloadReplayViewerModules();
      }}
      onClick={() => {
        void openReplay(recording.matchId);
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-100">
              {recording.playerNames.join(" vs ")}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                recording.isCpuMatch
                  ? "bg-amber-500/60 text-amber-50"
                  : recording.matchType === "sealed"
                    ? "bg-blue-500/60 text-blue-50"
                    : "bg-emerald-500/60 text-emerald-50"
              }`}
            >
              {recording.isCpuMatch ? "vs CPU" : recording.matchType}
            </span>
          </div>
          <div className="text-xs text-slate-400">
            {formatDate(recording.startTime)}
          </div>
        </div>
        <div
          className="flex items-stretch flex-shrink-0 rounded-lg overflow-hidden border border-slate-700/50 bg-slate-800/40"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-right text-xs text-slate-400 space-y-0.5 pointer-events-none select-none">
            <div>
              <span className="uppercase tracking-wide text-slate-500 text-[10px]">Duration</span>{" "}
              {recording.duration
                ? formatDuration(recording.duration)
                : "—"}
            </div>
            <div>
              <span className="uppercase tracking-wide text-slate-500 text-[10px]">Actions</span>{" "}
              {recording.actionCount}
            </div>
          </div>
          <div className="w-px bg-slate-700/50 self-stretch" />
          <ShareButton matchId={recording.matchId} />
        </div>
      </div>
    </div>
  );

  // Separate recordings into own matches, CPU matches, and others' matches
  const onlineRecordings = recordings.filter((r) => !r.isCpuMatch);
  const cpuRecordings = recordings.filter(
    (r) => r.isCpuMatch && r.playerIds?.includes(currentPlayerId || "")
  );
  const ownRecordings = onlineRecordings.filter((recording) =>
    recording.playerIds?.includes(currentPlayerId || "")
  );
  const otherRecordings = onlineRecordings.filter(
    (recording) => !recording.playerIds?.includes(currentPlayerId || "")
  );

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
              {recordings.map(renderReplayCard)}
            </div>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 px-4 bg-slate-800/60 hover:bg-slate-800 disabled:bg-slate-800/40 border border-slate-700 rounded-lg text-sm text-slate-200 disabled:text-slate-500 transition-colors"
              >
                {loadingMore ? "Loading..." : "Load More"}
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
                  {ownRecordings.map(renderReplayCard)}
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
                  {otherRecordings.map(renderReplayCard)}
                </div>
              </div>
            )}

            {cpuRecordings.length > 0 && (
              <div className="rounded-xl bg-slate-950/60 ring-1 ring-amber-900/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold uppercase tracking-wide text-amber-200">
                    vs CPU
                  </h2>
                  <span className="text-xs text-slate-400">
                    {cpuRecordings.length} replays
                  </span>
                </div>
                <div className="grid gap-3">
                  {cpuRecordings.map(renderReplayCard)}
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
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </OnlinePageShell>
  );
}

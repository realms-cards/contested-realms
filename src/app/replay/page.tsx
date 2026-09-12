"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import {
  RcButton,
  RcLinkButton,
  rcButtonVariants,
} from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";

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
      type="button"
      onClick={handleShare}
      className="grid h-8 w-8 place-items-center rounded-rc-md border border-rc-line/22 text-rc-fg-muted transition-colors hover:border-rc-accent hover:text-rc-accent-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring"
      title={copied ? "Copied!" : "Copy share link"}
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-3.5 w-3.5 text-rc-success"
        >
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
        </svg>
      )}
    </button>
  );
}

/** Tone for the format chip on a replay row. */
function matchTypeTone(recording: MatchRecordingSummary): BadgeTone {
  if (recording.isCpuMatch) return "warn";
  if (recording.matchType === "sealed") return "default";
  return "ok";
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
      className="flex cursor-pointer flex-wrap items-center gap-4 border-b border-rc-line/8 px-[18px] py-3 transition-colors hover:bg-rc-accent/6"
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
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="m-0 truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
            {recording.playerNames.join(" vs ")}
          </h3>
          <Badge tone={matchTypeTone(recording)}>
            {recording.isCpuMatch ? "vs CPU" : recording.matchType}
          </Badge>
        </div>
        <div className="rc-hint mt-1">
          {formatDate(recording.startTime)} ·{" "}
          {recording.duration ? formatDuration(recording.duration) : "—"} ·{" "}
          {recording.actionCount} actions
        </div>
      </div>
      <div
        className="flex flex-shrink-0 items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <ShareButton matchId={recording.matchId} />
        <RcLinkButton
          variant="outline"
          size="sm"
          href={`/replay/${recording.matchId}`}
        >
          Open
        </RcLinkButton>
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

  const loadMoreButton = (
    <RcButton
      variant="outline"
      onClick={loadMore}
      disabled={loadingMore}
      className="w-full"
    >
      {loadingMore ? "Loading..." : "Load More"}
    </RcButton>
  );

  return (
    <OnlinePageShell>
      <PageHeader
        eyebrow="archive"
        title="Replays"
        description="Watch recorded matches, or upload a previously downloaded replay file to watch it locally."
        actions={
          <>
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
              className={rcButtonVariants({ variant: "outline", size: "sm" })}
              title="Upload Replay"
            >
              Load Local Replay
            </label>
          </>
        }
      />

      {uploadError && (
        <div className="rc-alert" data-tone="danger">
          {uploadError}
        </div>
      )}

      {/* Filter Section */}
      {currentPlayerId && (
        <section className="rc-panel">
          <div className="px-[18px] py-3.5">
            <label className="rc-check">
              <input
                type="checkbox"
                checked={showOwnOnly}
                onChange={(e) => {
                  setShowOwnOnly(e.target.checked);
                }}
              />
              Show only my matches
            </label>
          </div>
        </section>
      )}

      {loading ? (
        <div className="rc-hint py-6 text-center">loading recordings…</div>
      ) : recordings.length === 0 ? (
        <RcEmpty title="No match recordings found.">
          play some online matches to generate replays
        </RcEmpty>
      ) : showOwnOnly ? (
        <section className="rc-panel">
          <PanelHeader
            title="Your Matches"
            meta={`${recordings.length} replays`}
          />
          <div>{recordings.map(renderReplayCard)}</div>
          {hasMore && <div className="px-[18px] py-3.5">{loadMoreButton}</div>}
        </section>
      ) : (
        <>
          {ownRecordings.length > 0 && (
            <section className="rc-panel">
              <PanelHeader
                title="Your Matches"
                meta={`${ownRecordings.length} replays`}
              />
              <div>{ownRecordings.map(renderReplayCard)}</div>
            </section>
          )}

          {otherRecordings.length > 0 && (
            <section className="rc-panel">
              <PanelHeader
                title="Other Matches"
                meta={`${otherRecordings.length} replays`}
              />
              <div>{otherRecordings.map(renderReplayCard)}</div>
            </section>
          )}

          {cpuRecordings.length > 0 && (
            <section className="rc-panel">
              <PanelHeader
                title="vs CPU"
                meta={`${cpuRecordings.length} replays`}
              />
              <div>{cpuRecordings.map(renderReplayCard)}</div>
            </section>
          )}

          {hasMore && (
            <section className="rc-panel">
              <div className="px-[18px] py-3.5">{loadMoreButton}</div>
            </section>
          )}
        </>
      )}
    </OnlinePageShell>
  );
}

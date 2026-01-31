"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useOnline } from "@/app/online/online-context";

type Status =
  | "init"
  | "connecting"
  | "checking"
  | "prompt"
  | "creating"
  | "redirecting"
  | "error";

/**
 * Detect whether the current match (from online context) is a CPU match.
 * CPU player IDs start with "cpu_".
 */
function isCpuMatch(
  match: { id?: string; players?: { id?: string }[] } | null,
): boolean {
  if (!match?.id || !match.players) return false;
  return match.players.some((p) => p.id?.startsWith("cpu_"));
}

export default function VsCpuPage() {
  const router = useRouter();
  const { connected, startCpuMatch, match, leaveMatch } = useOnline();
  const [status, setStatus] = useState<Status>("init");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);
  const matchRef = useRef(match);
  matchRef.current = match;

  // Enable guides by default for vs-cpu
  const enableGuides = useCallback(() => {
    try {
      localStorage.setItem("sorcery:interactionGuides", "1");
      localStorage.setItem("sorcery:magicGuides", "1");
    } catch {
      // ignore
    }
  }, []);

  // Step 1: Wait for connection
  useEffect(() => {
    if (!connected) {
      setStatus("connecting");
    }
  }, [connected]);

  // Step 2: Once connected, start checking for existing CPU match
  // The server re-sends matchStarted on reconnect if the player has an active match
  // Give it time to arrive
  useEffect(() => {
    if (!connected) return;
    if (status !== "init" && status !== "connecting") return;

    // Check immediately first
    if (isCpuMatch(match)) {
      setStatus("prompt");
      return;
    }

    // Wait for server to send matchStarted (arrives shortly after welcome)
    setStatus("checking");
  }, [connected, match, status]);

  // Step 3: While checking, watch for match to arrive from server
  useEffect(() => {
    if (status !== "checking") return;

    // Match arrived — check if it's a CPU match
    if (isCpuMatch(match)) {
      setStatus("prompt");
      return;
    }

    // Give server 1.5s to send matchStarted
    const timer = setTimeout(() => {
      // Use ref to read latest match value (not stale closure)
      if (isCpuMatch(matchRef.current)) {
        setStatus("prompt");
      } else {
        // No existing CPU match — auto-create a new one
        handleNewGame();
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, match]);

  const handleNewGame = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // If we have an existing match, leave it first
    if (matchRef.current?.id) {
      try {
        leaveMatch();
      } catch {
        // ignore
      }
    }

    enableGuides();
    setStatus("creating");

    // Small delay to let leaveMatch propagate before creating new match
    setTimeout(() => {
      if (startCpuMatch) {
        startCpuMatch();
      }
    }, matchRef.current?.id ? 300 : 0);
  }, [leaveMatch, enableGuides, startCpuMatch]);

  const handleResume = useCallback(() => {
    if (!match?.id) return;
    enableGuides();
    setStatus("redirecting");
    router.replace(`/online/play/${match.id}`);
  }, [match?.id, enableGuides, router]);

  // Watch for match being set in context (from matchStarted event)
  // This is the reliable signal that the match was created
  useEffect(() => {
    if (status !== "creating") return;
    if (!match?.id) return;

    setStatus("redirecting");
    router.replace(`/online/play/${match.id}`);
  }, [match, status, router]);

  // Timeout after 20 seconds if no match appears
  useEffect(() => {
    if (status !== "creating") return;
    const timeout = setTimeout(() => {
      setStatus("error");
      setErrorMsg("Timed out waiting for match creation");
      startedRef.current = false;
    }, 20000);
    return () => clearTimeout(timeout);
  }, [status]);

  const handleRetry = () => {
    setStatus("init");
    setErrorMsg(null);
    startedRef.current = false;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center space-y-4">
        {status === "init" || status === "connecting" || status === "checking" ? (
          <>
            <div className="text-slate-300 text-lg">
              {status === "checking" ? "Checking for active game..." : "Connecting to server..."}
            </div>
            <div className="animate-pulse text-slate-500 text-sm">
              {status === "checking" ? "Looking for existing match" : "Establishing connection"}
            </div>
          </>
        ) : status === "prompt" ? (
          <div className="space-y-4">
            <div className="text-slate-300 text-lg">
              You have an active game against CPU
            </div>
            <div className="text-slate-500 text-sm">
              Would you like to resume or start a new game?
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleResume}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
              >
                Resume Game
              </button>
              <button
                onClick={handleNewGame}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
              >
                New Game
              </button>
            </div>
          </div>
        ) : status === "creating" ? (
          <>
            <div className="text-slate-300 text-lg">
              Setting up match against CPU...
            </div>
            <div className="animate-pulse text-slate-500 text-sm">
              Creating lobby and spawning bot
            </div>
          </>
        ) : status === "redirecting" ? (
          <>
            <div className="text-slate-300 text-lg">Match ready!</div>
            <div className="animate-pulse text-slate-500 text-sm">
              Redirecting to game...
            </div>
          </>
        ) : status === "error" ? (
          <div className="space-y-4">
            <div className="text-red-400 text-lg">
              {errorMsg || "Something went wrong"}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

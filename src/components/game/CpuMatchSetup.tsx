"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useOnline } from "@/app/online/online-context";
import { goldfishOpponentKey } from "@/lib/game/cpu/goldfishTesting";
import { betaPrecons } from "@/lib/game/cpu/precons";
import { fetchPatrons, isPatron } from "@/lib/patrons";

type Status =
  | "init"
  | "connecting"
  | "checking"
  | "selecting"
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

export default function CpuMatchSetup({ mode }: { mode: "precon" | "goldfish" }) {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const { connected, startCpuMatch, match, leaveMatch } = useOnline();
  const [status, setStatus] = useState<Status>("init");
  const [preconId, setPreconId] = useState("");
  useEffect(() => {
    if (mode !== "goldfish" || !session?.user?.id) return;
    try {
      const previous = sessionStorage.getItem(goldfishOpponentKey(session.user.id));
      if (betaPrecons.some(deck => deck.id === previous)) setPreconId(previous || "");
    } catch {}
  },[mode,session?.user?.id]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);
  const creationTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (creationTimer.current !== null) window.clearTimeout(creationTimer.current);
  }, []);
  const previousMatchId = useRef<string | null>(null);
  const matchRef = useRef(match);
  matchRef.current = match;

  // Patron gate — redirect non-patrons back to home
  useEffect(() => {
    if (authStatus === "loading") return;
    const userId = session?.user?.id as string | undefined;
    if (!userId) {
      router.replace("/");
      return;
    }
    fetchPatrons().then(() => {
      if (!isPatron(userId)) {
        router.replace("/");
      }
    });
  }, [session, authStatus, router]);

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
        setStatus("selecting");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [status, match]);

  const handleNewGame = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    previousMatchId.current = matchRef.current?.id || null;

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
    creationTimer.current = window.setTimeout(() => {
      creationTimer.current = null;
      if (startCpuMatch) {
        const opponent = preconId || (mode === "goldfish" ? betaPrecons[Math.floor(Math.random()*betaPrecons.length)].id : undefined);
        if (mode === "goldfish" && session?.user?.id && opponent) {
          try { sessionStorage.setItem(goldfishOpponentKey(session.user.id),opponent); } catch {}
        }
        startCpuMatch(opponent, mode);
      }
    }, matchRef.current?.id ? 300 : 0);
  }, [leaveMatch, enableGuides, startCpuMatch, preconId, mode, session?.user?.id]);

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

    if (match.id === previousMatchId.current || !isCpuMatch(match)) return;

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
                onClick={() => setStatus("selecting")}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
              >
                New Game
              </button>
            </div>
          </div>
        ) : status === "selecting" ? (
          <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h1 className="font-fantaisie text-3xl text-amber-100">{mode === "precon" ? "VS CPU Precons" : "Goldfish — Test Any Deck"}</h1>
            <p className="text-sm text-slate-400">{mode === "precon" ? "Choose your opponent. You will choose your own Beta precon next." : "Choose a CPU sparring partner, then load any of your decks or import a deck. Cards outside the supported precons may need manual resolution."}</p>
            <p className="max-w-lg text-sm text-amber-200/80">Experimental: card automation is still incomplete. Some effects need manual resolution, and the CPU skips Magic cards without a supported resolver.</p>
            <label htmlFor="cpu-precon" className="block text-left text-sm text-slate-200">Opponent’s deck</label>
            <select id="cpu-precon" value={preconId} onChange={event => setPreconId(event.target.value)} className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white">
              <option value="">Random element</option>
              {betaPrecons.map(deck => <option key={deck.id} value={deck.id}>{deck.name} — {deck.avatar}</option>)}
            </select>
            <button onClick={handleNewGame} className="rounded bg-indigo-600 px-5 py-2 text-white hover:bg-indigo-500">Start game</button>
            <p className="text-sm text-slate-400">
              <Link href={mode === "precon" ? "/play/goldfish" : "/play/vs-cpu"} className="text-amber-200 underline underline-offset-4">
                {mode === "precon" ? "Want to test your own deck? Open Goldfish" : "Prefer fixed decks? Open VS CPU Precons"}
              </Link>
            </p>
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

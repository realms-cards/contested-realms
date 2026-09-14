"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useOnline } from "@/app/online/online-context";
import AppShell from "@/components/ui/AppShell";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
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

const TILE_BASE =
  "w-full rounded-rc-md border bg-black/30 px-3.5 py-3 text-left transition-[border-color,box-shadow,background-color] duration-150";
const TILE_IDLE = "border-rc-line/12 hover:border-rc-accent/50";
const TILE_SELECTED =
  "border-rc-accent shadow-[0_0_18px_rgba(243,207,106,0.28)]";

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

  const title =
    mode === "precon" ? "VS CPU Precons" : "Goldfish — Test Any Deck";
  const description =
    mode === "precon"
      ? "Choose your opponent. You will choose your own Beta precon next."
      : "Choose a CPU sparring partner, then load any of your decks or import a deck. Cards outside the supported precons may need manual resolution.";

  return (
    <AppShell width="narrow">
      <PageHeader
        eyebrow="experimental"
        title={title}
        description={description}
      />

      {status === "init" || status === "connecting" || status === "checking" ? (
        <section className="rc-panel px-[18px] py-3.5">
          <div className="font-rc-display text-[26px] leading-none text-rc-fg-strong">
            {status === "checking"
              ? "Checking for active game…"
              : "Connecting to server…"}
          </div>
          <div className="rc-hint mt-2 animate-pulse">
            {status === "checking"
              ? "Looking for existing match"
              : "Establishing connection"}
          </div>
        </section>
      ) : status === "prompt" ? (
        <section className="rc-panel space-y-4 px-[18px] py-3.5">
          <div>
            <div className="font-rc-display text-[26px] leading-none text-rc-fg-strong">
              You have an active game against CPU
            </div>
            <div className="rc-hint mt-2">
              Would you like to resume or start a new game?
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <RcButton onClick={handleResume}>Resume Game</RcButton>
            <RcButton variant="outline" onClick={() => setStatus("selecting")}>
              New Game
            </RcButton>
          </div>
        </section>
      ) : status === "selecting" ? (
        <section className="rc-panel space-y-4 px-[18px] py-3.5">
          <div className="rc-alert" data-tone="warning">
            Experimental: card automation is still incomplete. Some effects need
            manual resolution, and the CPU skips Magic cards without a supported
            resolver.
          </div>

          <div>
            <div className="rc-field-label mb-2" id="cpu-precon-label">
              Opponent&rsquo;s deck
            </div>
            <div
              role="radiogroup"
              aria-labelledby="cpu-precon-label"
              className="grid gap-2 sm:grid-cols-2"
            >
              <button
                type="button"
                role="radio"
                aria-checked={preconId === ""}
                onClick={() => setPreconId("")}
                className={`${TILE_BASE} ${
                  preconId === "" ? TILE_SELECTED : TILE_IDLE
                }`}
              >
                <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                  Random element
                </div>
                <div className="rc-hint mt-1">any beta precon</div>
              </button>
              {betaPrecons.map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  role="radio"
                  aria-checked={preconId === deck.id}
                  onClick={() => setPreconId(deck.id)}
                  className={`${TILE_BASE} ${
                    preconId === deck.id ? TILE_SELECTED : TILE_IDLE
                  }`}
                >
                  <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                    {deck.name}
                  </div>
                  <div className="rc-hint mt-1">{deck.avatar}</div>
                </button>
              ))}
            </div>
          </div>

          <RcButton size="lg" onClick={handleNewGame}>
            Start game
          </RcButton>

          <p className="font-rc-sans text-sm text-rc-fg-muted">
            <Link
              href={mode === "precon" ? "/play/goldfish" : "/play/vs-cpu"}
              className="rc-link underline underline-offset-4"
            >
              {mode === "precon"
                ? "Want to test your own deck? Open Goldfish"
                : "Prefer fixed decks? Open VS CPU Precons"}
            </Link>
          </p>
        </section>
      ) : status === "creating" ? (
        <section className="rc-panel px-[18px] py-3.5">
          <div className="font-rc-display text-[26px] leading-none text-rc-fg-strong">
            Setting up match against CPU…
          </div>
          <div className="rc-hint mt-2 animate-pulse">
            Creating lobby and spawning bot
          </div>
        </section>
      ) : status === "redirecting" ? (
        <section className="rc-panel px-[18px] py-3.5">
          <div className="font-rc-display text-[26px] leading-none text-rc-fg-strong">
            Match ready
          </div>
          <div className="rc-hint mt-2 animate-pulse">Redirecting to game…</div>
        </section>
      ) : status === "error" ? (
        <section className="space-y-4">
          <div className="rc-alert" data-tone="danger">
            {errorMsg || "Something went wrong"}
          </div>
          <div className="flex flex-wrap gap-3">
            <RcButton variant="outline" onClick={handleRetry}>
              Try Again
            </RcButton>
            <RcButton variant="ghost" onClick={() => router.push("/")}>
              Back to Home
            </RcButton>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

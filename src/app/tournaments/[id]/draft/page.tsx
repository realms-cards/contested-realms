"use client";

import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import GuestGate from "@/components/auth/GuestGate";
import FloatingChat from "@/components/chat/FloatingChat";
import AppShell from "@/components/ui/AppShell";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { useRealtimeTournamentsOptional } from "@/contexts/RealtimeTournamentContext";
import { useViewer } from "@/lib/guest/useViewer";

type DraftParticipant = {
  playerId: string;
  playerName: string;
  seatNumber: number;
  status: string;
};
type DraftSession = {
  id: string;
  status: "waiting" | "active" | "completed";
  participants: DraftParticipant[];
  startedAt: string | null;
};

export default function TournamentDraftPage() {
  const params = useParams();
  const router = useRouter();
  const viewer = useViewer();
  const searchParams = useSearchParams();
  const pathnameForReturn = usePathname();
  const currentHref = `${pathnameForReturn ?? "/"}${
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const tournamentId = String(params?.id || "");
  const tournamentsCtx = useRealtimeTournamentsOptional();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<DraftSession | null>(null);
  const [playersJoined, setPlayersJoined] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const redirectedRef = useRef(false);

  const joinDraft = useCallback(async () => {
    if (!tournamentId) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(
          tournamentId
        )}/preparation/draft/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Failed to join draft session");
      setSession(data.draftSession as DraftSession);
      setPlayersJoined(Number(data.playersJoined || 0));
      setTotalPlayers(Number(data.totalPlayers || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (viewer.status === "ready" && viewer.id) {
      void joinDraft();
    }
  }, [viewer.status, viewer.id, router, tournamentId, joinDraft]);

  useEffect(() => {
    if (!tournamentId) return;
    tournamentsCtx?.setCurrentTournamentById?.(tournamentId);
  }, [tournamentsCtx, tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    const id = setInterval(() => {
      void joinDraft();
    }, 3000);
    return () => clearInterval(id);
  }, [tournamentId, joinDraft]);

  const proceedToDeckBuild = useCallback(async () => {
    if (!session?.id) return;
    // Seed editor with authoritative picks from the server if available
    try {
      const res = await fetch(`/api/draft-sessions/${session.id}/state`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.myPicks)) {
          const playerId = viewer.id;
          const storageSuffix = playerId
            ? `${session.id}_${playerId}`
            : session.id;
          try {
            localStorage.setItem(
              `draftedCards_${storageSuffix}`,
              JSON.stringify(data.myPicks)
            );
            if (playerId) {
              localStorage.setItem(
                `draftedCards_${session.id}`,
                JSON.stringify(data.myPicks)
              );
            }
          } catch {}
        }
      }
    } catch {}
    const params = new URLSearchParams({
      draft: "true",
      tournament: tournamentId,
      matchName: "Draft",
      sessionId: session.id,
      playerId: viewer.id || "",
    });
    window.location.href = `/decks/editor-3d?${params.toString()}`;
  }, [session?.id, tournamentId, viewer.id]);

  useEffect(() => {
    if (redirectedRef.current) return;
    if (!session?.id) return;

    if (session.status === "completed") {
      // Check if deck has already been submitted to avoid redirect loop
      let alreadySubmitted = false;
      try {
        alreadySubmitted =
          localStorage.getItem(`draft_submitted_tournament_${tournamentId}`) ===
          "true";
      } catch {}

      if (alreadySubmitted) {
        // Already submitted - go back to tournament page instead of deck editor
        redirectedRef.current = true;
        router.replace(`/tournaments/${tournamentId}`);
        return;
      }

      redirectedRef.current = true;
      void proceedToDeckBuild();
      return;
    }

    if (session.status === "waiting" || session.status === "active") {
      redirectedRef.current = true;
      const playerId = viewer.id || "";
      router.replace(
        `/online/draft/${session.id}?tournament=${tournamentId}&playerId=${playerId}`
      );
    }
  }, [
    session?.id,
    session?.status,
    router,
    tournamentId,
    viewer.id,
    proceedToDeckBuild,
  ]);

  if (viewer.status === "loading" || (loading && !viewer.isAnonymous)) {
    return (
      <AppShell>
        <div className="rc-hint py-16 text-center">joining draft session…</div>
      </AppShell>
    );
  }

  if (viewer.isAnonymous) {
    return (
      <AppShell width="narrow">
        <GuestGate
          title="Tournament draft"
          description="Sign in or continue as a guest to take your seat in the draft."
          returnTo={currentHref}
        />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell width="narrow">
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <FloatingChat tournamentId={tournamentId} mode="bubble" />
      <PageHeader
        eyebrow="tournament"
        title="Tournament Draft"
        description="Take your seat — the draft starts once every player has joined."
        actions={
          <RcLinkButton
            variant="outline"
            size="sm"
            href={`/tournaments/${tournamentId}`}
          >
            Back to overview
          </RcLinkButton>
        }
      />

      <section className="rc-panel px-[18px] py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4 font-rc-mono text-[13px] text-rc-fg-muted">
          <div>
            Status:{" "}
            <span className="capitalize text-rc-fg-strong">
              {session?.status || "waiting"}
            </span>
          </div>
          <div>
            Players:{" "}
            <span className="tabular-nums text-rc-fg-strong">
              {playersJoined}/{totalPlayers}
            </span>
          </div>
        </div>
        <div className="rc-hint mt-3 truncate">Session ID: {session?.id}</div>
      </section>

      <section className="rc-panel">
        <PanelHeader
          title="Participants"
          meta={`${session?.participants?.length ?? 0} seated`}
        />
        <div className="grid gap-2 px-[18px] py-3.5">
          {session?.participants?.length ? (
            session.participants.map((p) => (
              <div
                key={p.playerId}
                className="flex items-center justify-between gap-3 rounded-rc-md border border-rc-line/14 bg-black/30 px-3 py-2"
              >
                <div className="truncate font-rc-mono text-sm font-semibold text-rc-fg-strong">
                  {p.playerName}
                </div>
                <div className="shrink-0 font-rc-mono text-[11px] uppercase tracking-[0.12em] text-rc-fg-subtle">
                  Seat {p.seatNumber} · {p.status}
                </div>
              </div>
            ))
          ) : (
            <div className="rc-hint py-6 text-center">no participants yet</div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <RcButton variant="outline" onClick={() => joinDraft()}>
          Refresh
        </RcButton>
        {session?.status === "completed" && (
          <RcButton
            onClick={() => {
              void proceedToDeckBuild();
            }}
            title="Proceed to deck construction"
          >
            Proceed to Deck Construction
          </RcButton>
        )}
      </div>
    </AppShell>
  );
}

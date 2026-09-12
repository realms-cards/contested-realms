"use client";

import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "@/app/online/online-context";
import GuestGate from "@/components/auth/GuestGate";
import FloatingChat from "@/components/chat/FloatingChat";
import TournamentDraft3DScreen from "@/components/game/TournamentDraft3DScreen";
import AppShell from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { useViewer } from "@/lib/guest/useViewer";

type DraftParticipant = {
  playerId: string;
  playerName: string;
  seatNumber: number;
  status: string;
};

type DraftSession = {
  id: string;
  tournamentId: string;
  status: "waiting" | "active" | "completed";
  participants: DraftParticipant[];
  packConfiguration: Array<{ setId: string; packCount: number }>;
  settings: {
    timePerPick: number;
    deckBuildingTime: number;
  };
  startedAt: string | null;
};

export default function TournamentDraftSessionPage() {
  const params = useParams();
  const router = useRouter();
  const viewer = useViewer();
  const searchParams = useSearchParams();
  const pathnameForReturn = usePathname();
  const currentHref = `${pathnameForReturn ?? "/"}${
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const sessionId = String(params?.sessionId || "");
  const { transport } = useOnline();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftSession, setDraftSession] = useState<DraftSession | null>(null);
  const redirectedRef = useRef(false);

  // Fetch draft session details
  const fetchDraftSession = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/draft-sessions/${sessionId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch draft session");
      }

      setDraftSession(data);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (viewer.id && sessionId) {
      fetchDraftSession();
    }
  }, [viewer.id, sessionId, router, fetchDraftSession]);

  // Persist cube-related draft configuration so deck editor can recover cube extras
  useEffect(() => {
    if (!draftSession) return;
    try {
      const settings = draftSession.settings as unknown as {
        cubeId?: string | null;
        cubeName?: string | null;
        includeCubeSideboardInStandard?: boolean;
      };
      const cubeId = settings?.cubeId ?? null;
      if (!cubeId) return;

      const slim = {
        cubeId,
        cubeName: settings?.cubeName ?? null,
        includeCubeSideboardInStandard:
          settings?.includeCubeSideboardInStandard === true,
      };

      localStorage.setItem(
        `draftConfig_${draftSession.id}`,
        JSON.stringify(slim)
      );
    } catch {
      // Best-effort; deck editor will simply skip cube extras if this fails
    }
  }, [draftSession]);

  // Fallback: poll minimal state to detect completion and navigate to deck construction
  useEffect(() => {
    if (!sessionId || redirectedRef.current) return;
    let mounted = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/draft-sessions/${sessionId}/state`, {
          cache: "no-store",
        });
        if (!mounted || !res.ok) return;
        const data = await res.json();
        if (
          data?.status === "completed" &&
          viewer.id &&
          !redirectedRef.current
        ) {
          redirectedRef.current = true;
          // Attempt to stash picks for editor if provided
          try {
            if (Array.isArray(data?.myPicks)) {
              const playerId = viewer.id;
              const storageSuffix = playerId
                ? `${sessionId}_${playerId}`
                : sessionId;
              localStorage.setItem(
                `draftedCards_${storageSuffix}`,
                JSON.stringify(data.myPicks)
              );
              if (playerId) {
                localStorage.setItem(
                  `draftedCards_${sessionId}`,
                  JSON.stringify(data.myPicks)
                );
              }

              // Also pre-resolve to SearchResult[] so the editor skips slow lookups
              try {
                type DraftPick = {
                  slug?: string;
                  name?: string;
                  cardName?: string;
                  type?: string | null;
                  setName?: string | null;
                  rarity?: string | null;
                };
                const picks: DraftPick[] = data.myPicks as DraftPick[];
                const bySet = new Map<string | null, Set<string>>();
                for (const c of picks) {
                  const slug = typeof c.slug === "string" ? c.slug : "";
                  if (!slug) continue;
                  const setName =
                    typeof c.setName === "string" && c.setName
                      ? c.setName
                      : null;
                  let group = bySet.get(setName);
                  if (!group) {
                    group = new Set<string>();
                    bySet.set(setName, group);
                  }
                  group.add(slug);
                }
                const requests: Promise<
                  Array<{
                    slug: string;
                    cardId: number;
                    cost: number | null;
                    thresholds: Record<string, number> | null;
                    attack: number | null;
                    defence: number | null;
                  }>
                >[] = [];
                for (const [setName, slugs] of bySet.entries()) {
                  if (!slugs || slugs.size === 0) continue;
                  const params = new URLSearchParams();
                  params.set("slugs", Array.from(slugs).join(","));
                  if (setName) params.set("set", setName);
                  requests.push(
                    fetch(`/api/cards/meta-by-variant?${params.toString()}`)
                      .then((r) => r.json())
                      .catch(() => [])
                  );
                }
                const chunks = await Promise.all(requests);
                const rows = chunks.flat();
                if (Array.isArray(rows) && rows.length) {
                  const idBySlug = new Map<string, number>();
                  for (const r of rows) {
                    const cid = Number((r as { cardId: number }).cardId) || 0;
                    const slug = String((r as { slug: string }).slug || "");
                    if (slug) idBySlug.set(slug, cid);
                  }
                  const resolved = picks
                    .map((c) => {
                      const slug = typeof c.slug === "string" ? c.slug : "";
                      const cardId = slug ? idBySlug.get(slug) || 0 : 0;
                      const name = (c.cardName || c.name) as string | undefined;
                      const setName = (c.setName || "Beta") as string;
                      return cardId > 0 && slug && name
                        ? {
                            variantId: 0,
                            slug,
                            finish: "Standard",
                            product: "Draft",
                            cardId,
                            cardName: name,
                            set: setName,
                            type: (c.type as string | null) || null,
                            rarity: (c.rarity as string | null) || null,
                          }
                        : null;
                    })
                    .filter(Boolean);
                  try {
                    localStorage.setItem(
                      `draftedCardsResolved_${storageSuffix}`,
                      JSON.stringify(resolved)
                    );
                    if (playerId) {
                      localStorage.setItem(
                        `draftedCardsResolved_${sessionId}`,
                        JSON.stringify(resolved)
                      );
                    }
                  } catch {}
                }
              } catch {}
            }
          } catch {}
          const params = new URLSearchParams({
            draft: "true",
            tournament: draftSession?.tournamentId || "",
            matchName: "Draft",
            sessionId,
            playerId: viewer.id,
          });
          router.push(`/decks/editor-3d?${params.toString()}`);
        }
      } catch {}
    };
    const id = window.setInterval(tick, 2000);
    // run once quickly
    void tick();
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [sessionId, viewer.id, draftSession?.tournamentId, router]);

  // Handle draft completion
  const handleDraftComplete = () => {
    console.log(
      "[DraftSessionPage] handleDraftComplete called, navigating to deck editor"
    );
    // Navigate to deck construction
    if (draftSession) {
      const params = new URLSearchParams({
        draft: "true",
        tournament: draftSession.tournamentId,
        matchName: "Draft",
        sessionId: draftSession.id,
        playerId: viewer.id ?? "",
      });
      console.log(
        "[DraftSessionPage] Pushing to:",
        `/decks/editor-3d?${params.toString()}`
      );
      router.push(`/decks/editor-3d?${params.toString()}`);
    } else {
      console.warn(
        "[DraftSessionPage] handleDraftComplete called but draftSession is null"
      );
    }
  };

  if (viewer.status === "loading" || (loading && !viewer.isAnonymous)) {
    return (
      <AppShell width="wide">
        <div className="rc-hint py-6 text-center">Loading draft session…</div>
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

  if (error || !draftSession) {
    return (
      <AppShell width="wide">
        <div className="rc-alert" data-tone="danger">
          {error || "Draft session not found"}
        </div>
      </AppShell>
    );
  }

  // Show 3D draft UI for active or waiting sessions (skip redundant lobby)
  if (
    (draftSession.status === "active" || draftSession.status === "waiting") &&
    viewer.id &&
    transport
  ) {
    const myPlayerId = viewer.id;
    const myParticipant = draftSession.participants.find(
      (p) => p.playerId === myPlayerId
    );

    if (!myParticipant) {
      return (
        <AppShell width="wide">
          <div className="rc-alert" data-tone="danger">
            You are not a participant in this draft session
          </div>
        </AppShell>
      );
    }

    // Build player names map indexed by seat number (for compatibility)
    const playerNamesBySeat: Record<number, string> = {};
    draftSession.participants.forEach((p) => {
      playerNamesBySeat[p.seatNumber] = p.playerName;
    });

    return (
      <TournamentDraft3DScreen
        draftSessionId={draftSession.id}
        tournamentId={draftSession.tournamentId}
        myPlayerId={myPlayerId}
        mySeatNumber={myParticipant.seatNumber}
        participants={draftSession.participants}
        playerNamesBySeat={playerNamesBySeat}
        onDraftComplete={handleDraftComplete}
      />
    );
  }

  // Show waiting screen
  return (
    <AppShell width="wide">
      {draftSession?.tournamentId && (
        <FloatingChat tournamentId={draftSession.tournamentId} mode="bubble" />
      )}
      <PageHeader
        eyebrow="tournament"
        title="Tournament Draft Session"
        description="Waiting for the draft to open. Seats and status update live."
      />

      <section className="rc-panel flex flex-wrap items-center gap-8 px-[18px] py-3.5">
        <div>
          <div className="rc-hint uppercase">Status</div>
          <div className="mt-1">
            <Badge tone={draftSession.status === "completed" ? "ok" : "default"}>
              {draftSession.status}
            </Badge>
          </div>
        </div>
        <div>
          <div className="rc-hint uppercase">Players</div>
          <div className="rc-stat text-xl">
            {draftSession.participants.length}
          </div>
        </div>
      </section>

      <section className="rc-panel">
        <PanelHeader
          title="Participants"
          meta={`${draftSession.participants.length} seated`}
        />
        <div className="grid gap-2 px-[18px] py-3.5">
          {draftSession.participants.map((p) => (
            <div
              key={p.playerId}
              className="flex items-center justify-between gap-3 rounded-rc-md border border-rc-line/12 bg-black/30 px-3 py-2"
            >
              <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                {p.playerName}
              </div>
              <div className="font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-fg-subtle">
                Seat {p.seatNumber} · {p.status}
              </div>
            </div>
          ))}
        </div>
      </section>

      {draftSession.status === "completed" && (
        <section className="space-y-3">
          <div className="rc-alert" data-tone="success">
            Draft completed. The draft has finished. You can now build your
            deck.
          </div>
          <RcButton
            onClick={async () => {
              // Fallback persistence: fetch final picks and store them for the editor
              try {
                const res = await fetch(
                  `/api/draft-sessions/${draftSession.id}/state`,
                  { cache: "no-store" }
                );
                if (res.ok) {
                  const payload = await res.json();
                  const ds = payload?.draftState as unknown;
                  type DraftCard = {
                    id: string | number;
                    slug: string;
                    name?: string;
                    cardName?: string;
                    type?: string | null;
                    setName?: string;
                    rarity?: string;
                  };
                  type DraftStateLike = { picks?: DraftCard[][] };
                  const state = ds as DraftStateLike;
                  const me = viewer.id
                    ? String(viewer.id)
                    : null;
                  const mySeat = me
                    ? draftSession.participants.find((p) => p.playerId === me)
                        ?.seatNumber
                    : undefined;
                  const myIdx =
                    typeof mySeat === "number" && mySeat > 0 ? mySeat - 1 : 0;
                  const seatPicks =
                    state && Array.isArray(state.picks)
                      ? state.picks[myIdx]
                      : null;
                  const mine = Array.isArray(seatPicks)
                    ? (seatPicks as DraftCard[])
                    : [];
                  if (mine.length) {
                    try {
                      const playerId = viewer.id || "";
                      const storageSuffix = playerId
                        ? `${draftSession.id}_${playerId}`
                        : draftSession.id;
                      localStorage.setItem(
                        `draftedCards_${storageSuffix}`,
                        JSON.stringify(mine)
                      );
                      if (playerId) {
                        localStorage.setItem(
                          `draftedCards_${draftSession.id}`,
                          JSON.stringify(mine)
                        );
                      }
                    } catch {}
                  }
                }
              } catch {}
              const params = new URLSearchParams({
                draft: "true",
                tournament: draftSession.tournamentId,
                matchName: "Draft",
                sessionId: draftSession.id,
              });
              router.push(`/decks/editor-3d?${params.toString()}`);
            }}
          >
            Build Draft Deck
          </RcButton>
        </section>
      )}
    </AppShell>
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "@/app/online/online-context";
import TournamentDraft3DScreen from "@/components/game/TournamentDraft3DScreen";

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
  const { data: session, status } = useSession();
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
    if (status === "unauthenticated") {
      router.push(`/auth/signin?callbackUrl=/online/draft/${sessionId}`);
      return;
    }

    if (status === "authenticated" && sessionId) {
      fetchDraftSession();
    }
  }, [status, sessionId, router, fetchDraftSession]);

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
          session?.user &&
          !redirectedRef.current
        ) {
          redirectedRef.current = true;
          // Attempt to stash picks for editor if provided
          try {
            if (Array.isArray(data?.myPicks)) {
              const playerId = session.user.id;
              const storageSuffix = playerId ? `${sessionId}_${playerId}` : sessionId;
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
                  const slug = typeof c.slug === 'string' ? c.slug : '';
                  if (!slug) continue;
                  const setName = (typeof c.setName === 'string' && c.setName) ? c.setName : null;
                  let group = bySet.get(setName);
                  if (!group) {
                    group = new Set<string>();
                    bySet.set(setName, group);
                  }
                  group.add(slug);
                }
                const requests: Promise<Array<{ slug: string; cardId: number; cost: number | null; thresholds: Record<string, number> | null; attack: number | null; defence: number | null }>>[] = [];
                for (const [setName, slugs] of bySet.entries()) {
                  if (!slugs || slugs.size === 0) continue;
                  const params = new URLSearchParams();
                  params.set('slugs', Array.from(slugs).join(','));
                  if (setName) params.set('set', setName);
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
                    const slug = String((r as { slug: string }).slug || '');
                    if (slug) idBySlug.set(slug, cid);
                  }
                  const resolved = picks
                    .map((c) => {
                      const slug = typeof c.slug === 'string' ? c.slug : '';
                      const cardId = slug ? (idBySlug.get(slug) || 0) : 0;
                      const name = (c.cardName || c.name) as string | undefined;
                      const setName = (c.setName || 'Beta') as string;
                      return cardId > 0 && slug && name
                        ? {
                            variantId: 0,
                            slug,
                            finish: 'Standard',
                            product: 'Draft',
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
            playerId: session.user.id,
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
  }, [sessionId, session?.user, draftSession?.tournamentId, router]);

  // Handle draft completion
  const handleDraftComplete = () => {
    console.log("[DraftSessionPage] handleDraftComplete called, navigating to deck editor");
    // Navigate to deck construction
    if (draftSession) {
      const params = new URLSearchParams({
        draft: "true",
        tournament: draftSession.tournamentId,
        matchName: "Draft",
        sessionId: draftSession.id,
        playerId: session?.user.id ?? "",
      });
      console.log("[DraftSessionPage] Pushing to:", `/decks/editor-3d?${params.toString()}`);
      router.push(`/decks/editor-3d?${params.toString()}`);
    } else {
      console.warn("[DraftSessionPage] handleDraftComplete called but draftSession is null");
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white grid place-items-center">
        <div className="text-slate-300">Loading draft session…</div>
      </div>
    );
  }

  if (error || !draftSession) {
    return (
      <div className="min-h-screen bg-slate-900 text-white grid place-items-center">
        <div className="p-4 bg-rose-900/40 border border-rose-700 rounded">
          {error || "Draft session not found"}
        </div>
      </div>
    );
  }

  // Show 3D draft UI for active or waiting sessions (skip redundant lobby)
  if (
    (draftSession.status === "active" || draftSession.status === "waiting") &&
    session?.user &&
    transport
  ) {
    const myPlayerId = session.user.id;
    const myParticipant = draftSession.participants.find(
      (p) => p.playerId === myPlayerId
    );

    if (!myParticipant) {
      return (
        <div className="min-h-screen bg-slate-900 text-white grid place-items-center">
          <div className="p-4 bg-rose-900/40 border border-rose-700 rounded">
            You are not a participant in this draft session
          </div>
        </div>
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
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Tournament Draft Session</h1>

        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 mb-6">
          <div className="text-slate-300">
            Status:{" "}
            <span className="font-semibold text-white capitalize">
              {draftSession.status}
            </span>
          </div>
          <div className="text-slate-300 mt-2">
            Players: {draftSession.participants.length}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Participants</h2>
          <div className="grid gap-2">
            {draftSession.participants.map((p) => (
              <div
                key={p.playerId}
                className="flex items-center justify-between bg-black/20 border border-slate-700 rounded px-3 py-2"
              >
                <div className="text-white">{p.playerName}</div>
                <div className="text-xs text-slate-300">
                  Seat {p.seatNumber} • {p.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {draftSession.status === "completed" && (
          <div className="bg-green-900/40 border border-green-700 rounded-lg p-4">
            <div className="text-green-200 font-semibold mb-2">
              Draft completed
            </div>
            <div className="text-green-100 text-sm mb-4">
              The draft has finished. You can now build your deck.
            </div>
            <button
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
                    const me = session?.user?.id
                      ? String(session.user.id)
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
                        const playerId = session?.user?.id || "";
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
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Build Draft Deck
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

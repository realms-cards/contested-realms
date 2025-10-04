"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";

type DraftParticipant = { playerId: string; playerName: string; seatNumber: number; status: string };
type DraftSession = {
  id: string;
  status: "waiting" | "active" | "completed";
  participants: DraftParticipant[];
  startedAt: string | null;
};

export default function TournamentDraftPage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const tournamentId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<DraftSession | null>(null);
  const [playersJoined, setPlayersJoined] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const joinDraft = useCallback(async () => {
    if (!tournamentId) return;
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/preparation/draft/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to join draft session");
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
    // Require auth
    if (status === "unauthenticated") {
      router.push(`/auth/signin?callbackUrl=/tournaments/${tournamentId}/draft`);
      return;
    }
    if (status === "authenticated") {
      void joinDraft();
    }
  }, [status, router, tournamentId, joinDraft]);

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
      const res = await fetch(`/api/draft-sessions/${session.id}/state`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.myPicks)) {
          try { localStorage.setItem(`draftedCards_${session.id}`, JSON.stringify(data.myPicks)); } catch {}
        }
      }
    } catch {}
    const params = new URLSearchParams({
      draft: 'true',
      tournament: tournamentId,
      matchName: 'Draft',
      sessionId: session.id,
    });
    window.location.href = `/decks/editor-3d?${params.toString()}`;
  }, [session?.id, tournamentId]);

  // Auto-redirect to deck editor when session is completed; otherwise go to draft UI when active
  useEffect(() => {
    if (session?.status === 'completed') {
      void proceedToDeckBuild();
      return;
    }
    if (session?.status === 'active') {
      // Route to the real-time draft UI; it will redirect to editor upon completion
      if (session?.id) window.location.href = `/online/draft/${session.id}`;
    }
  }, [session?.status, session?.id, proceedToDeckBuild]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white grid place-items-center">
        <div className="text-slate-300">Joining draft session…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white grid place-items-center">
        <div className="p-4 bg-rose-900/40 border border-rose-700 rounded">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Tournament Draft</h1>
          <a href={`/tournaments/${tournamentId}`} className="text-slate-300 hover:text-white text-sm">Back to Overview</a>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="text-slate-300">Status: <span className="font-semibold text-white capitalize">{session?.status || "waiting"}</span></div>
            <div className="text-slate-300">Players: <span className="font-semibold text-white">{playersJoined}/{totalPlayers}</span></div>
          </div>
          <div className="mt-3 text-sm text-slate-300">Session ID: <span className="font-mono text-slate-200">{session?.id}</span></div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Participants</h2>
          <div className="grid gap-2">
            {session?.participants?.length ? (
              session.participants.map(p => (
                <div key={p.playerId} className="flex items-center justify-between bg-black/20 border border-slate-700 rounded px-3 py-2">
                  <div className="text-white">{p.playerName}</div>
                  <div className="text-xs text-slate-300">Seat {p.seatNumber} • {p.status}</div>
                </div>
              ))
            ) : (
              <div className="text-slate-400">No participants yet</div>
            )}
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm"
            onClick={() => joinDraft()}
          >
            Refresh
          </button>
          {session?.status === "completed" && (
            <button
              className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm"
              onClick={() => { void proceedToDeckBuild(); }}
              title="Proceed to deck construction"
            >
              Proceed to Deck Construction
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


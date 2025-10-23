"use client";

import { useMemo } from "react";
import { useRealtimeTournamentsOptional } from "@/contexts/RealtimeTournamentContext";

interface Props {
  tournamentId?: string | null;
}

export default function TournamentRoster({ tournamentId }: Props) {
  const rt = useRealtimeTournamentsOptional();
  const t = rt?.currentTournament && (!tournamentId || rt.currentTournament.id === tournamentId) ? rt.currentTournament : null;
  const tId = tournamentId ?? t?.id ?? null;
  const stats = t && rt?.statistics ? rt.statistics : null;
  const presence = useMemo(() => (tId && rt?.getPresenceFor ? rt.getPresenceFor(tId) : rt?.tournamentPresence) ?? [], [rt, tId]);

  const registered = useMemo(() => {
    const r = (t as unknown as { registeredPlayers?: Array<{ id: string; displayName?: string; ready?: boolean; deckSubmitted?: boolean }> })?.registeredPlayers;
    return Array.isArray(r) ? r : [];
  }, [t]);

  const activeRoundNumber = useMemo(() => {
    const r = (stats?.rounds || []).find((x: unknown) => (x as { status?: string }).status === "active") as { roundNumber?: number } | undefined;
    return typeof r?.roundNumber === "number" ? r.roundNumber : null;
  }, [stats?.rounds]);

  const players = useMemo(() => {
    const byIdPresence = new Map<string, { isConnected: boolean }>();
    for (const p of presence as Array<{ playerId: string; isConnected: boolean }>) {
      byIdPresence.set(p.playerId, { isConnected: p.isConnected });
    }
    const format = (t as { format?: string } | null)?.format ?? "constructed";
    const status = (t as { status?: string } | null)?.status ?? "registering";
    const list = registered.map((p) => {
      let state = "joining";
      if (status === "preparing") {
        const ready = Boolean((p as { ready?: boolean }).ready || (p as { deckSubmitted?: boolean }).deckSubmitted);
        if (ready) state = "ready";
        else if (format === "draft") state = "drafting";
        else if (format === "constructed" || format === "sealed") state = "constructing deck";
      } else if (status === "active") {
        const matches = Array.isArray(stats?.matches) ? (stats?.matches as Array<{ id: string; roundNumber?: number | null; status?: string; players: Array<{ id: string; name?: string }> }>) : [];
        const my = matches.find((m) => (activeRoundNumber == null || m.roundNumber === activeRoundNumber) && Array.isArray(m.players) && m.players.some((pp) => pp.id === p.id));
        if (my && my.status !== "completed") {
          const opp = (my.players || []).find((pp) => pp.id !== p.id);
          if (!opp) {
            state = "bye";
          } else {
            state = `playing match${opp?.name ? ` vs ${opp.name}` : ""}`;
          }
        } else {
          state = "waiting";
        }
      }
      const pres = byIdPresence.get(p.id)?.isConnected ?? false;
      return {
        id: p.id,
        name: (p.displayName || p.id),
        isConnected: pres,
        state,
      };
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [registered, presence, t, stats?.matches, activeRoundNumber]);

  if (!tId) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-slate-200 font-semibold">Players</div>
        <div className="text-slate-400 text-sm">{players.length}</div>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-700/40">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`inline-block w-2 h-2 rounded-full ${p.isConnected ? "bg-emerald-500" : "bg-slate-500"}`} />
              <span className="truncate">{p.name}</span>
            </div>
            <div className="text-xs text-slate-300 ml-3 whitespace-nowrap">{p.state}</div>
          </div>
        ))}
        {players.length === 0 && (
          <div className="text-slate-400 text-sm">No players yet</div>
        )}
      </div>
    </div>
  );
}

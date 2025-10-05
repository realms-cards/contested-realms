"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRealtimeTournamentsOptional } from "@/contexts/RealtimeTournamentContext";

type Props = {
  tournamentId?: string | null;
  draftSessionId?: string | null;
  position?: "top-right" | "bottom-left";
};

export default function TournamentPresenceOverlay({ tournamentId, draftSessionId, position = "top-right" }: Props) {
  const tournamentsCtx = useRealtimeTournamentsOptional();
  const [open, setOpen] = useState(false);
  const [seatByPlayerId, setSeatByPlayerId] = useState<Record<string, number>>({});

  // Attach to a specific tournament id if provided
  useEffect(() => {
    if (!tournamentsCtx) return;
    if (tournamentId) {
      try { tournamentsCtx.setCurrentTournamentById(String(tournamentId)); } catch {}
    }
  }, [tournamentsCtx, tournamentId]);

  // Optionally fetch seat numbers from draft session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!draftSessionId) return;
      try {
        const res = await fetch(`/api/draft-sessions/${encodeURIComponent(draftSessionId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const parts = Array.isArray(data?.participants) ? data.participants as Array<{ playerId: string; seatNumber: number }> : [];
        const map: Record<string, number> = {};
        for (const p of parts) map[String(p.playerId)] = Number(p.seatNumber);
        if (!cancelled) setSeatByPlayerId(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [draftSessionId]);

  // Merge seats from tournament statistics (matches include optional seat numbers)
  const statsSeatMap = useMemo(() => {
    const map: Record<string, number> = {};
    const matches = tournamentsCtx?.statistics?.matches || [];
    for (const m of matches) {
      const players = (m as unknown as { players?: Array<{ id: string; seat?: number | null }> }).players || [];
      for (const pl of players) {
        if (pl && typeof pl.id === 'string' && typeof pl.seat === 'number' && pl.seat != null) {
          map[pl.id] = pl.seat as number;
        }
      }
    }
    return map;
  }, [tournamentsCtx?.statistics?.matches]);

  const presence = (() => {
    const id = tournamentId || tournamentsCtx?.currentTournament?.id || null;
    const getter = (tournamentsCtx as unknown as { getPresenceFor?: (id: string | null) => Array<{ playerId: string; playerName: string; isConnected: boolean; lastActivity: number }> })?.getPresenceFor;
    if (getter) return getter(id);
    return tournamentsCtx?.tournamentPresence ?? [];
  })();
  const presenceMap = useMemo(() => {
    const m = new Map<string, { playerId: string; playerName: string; isConnected: boolean; lastActivity: number }>();
    for (const p of presence) m.set(p.playerId, p);
    return m;
  }, [presence]);

  // Build a roster from presence, registeredPlayers, standings, and seat maps
  const roster = useMemo(() => {
    const ids = new Set<string>();
    presence.forEach((p) => ids.add(p.playerId));
    Object.keys(seatByPlayerId).forEach((id) => ids.add(id));
    Object.keys(statsSeatMap).forEach((id) => ids.add(id));
    const standings = tournamentsCtx?.statistics?.standings || [];
    standings.forEach((s: { playerId: string }) => ids.add(s.playerId));
    const reg = (tournamentsCtx?.currentTournament as unknown as { registeredPlayers?: Array<{ id: string; displayName?: string }> })?.registeredPlayers || [];
    reg.forEach((r) => ids.add(r.id));

    const arr = Array.from(ids).map((id) => {
      const pr = presenceMap.get(id);
      const regName = reg.find((r) => r.id === id)?.displayName;
      const stName = (standings.find((s: { playerId: string; playerName?: string }) => s.playerId === id) as { playerName?: string } | undefined)?.playerName;
      const playerName = pr?.playerName || regName || stName || id.slice(-4);
      const seatNumber = seatByPlayerId[id] ?? statsSeatMap[id];
      const isConnected = pr?.isConnected ?? false;
      const lastActivity = pr?.lastActivity ?? 0;
      return { playerId: id, playerName, seatNumber, isConnected, lastActivity };
    });
    // Sort by seat if available, else by name
    arr.sort((a, b) => {
      const sa = a.seatNumber ?? 9999;
      const sb = b.seatNumber ?? 9999;
      if (sa !== sb) return sa - sb;
      return a.playerName.localeCompare(b.playerName);
    });
    return arr;
  }, [presence, presenceMap, seatByPlayerId, statsSeatMap, tournamentsCtx?.statistics?.standings, tournamentsCtx?.currentTournament]);

  const expectedTotal = useMemo(() => {
    // Trust live presence size; fallback to currentPlayers only when presence hasn't arrived
    if (presence.length > 0) return presence.length;
    const t = tournamentsCtx?.currentTournament as unknown as { currentPlayers?: number } | null;
    if (typeof t?.currentPlayers === 'number' && t.currentPlayers > 0) return t.currentPlayers;
    return 0;
  }, [presence.length, tournamentsCtx?.currentTournament]);

  const connectedCount = useMemo(() => presence.reduce((s, p) => s + (p.isConnected ? 1 : 0), 0), [presence]);
  const allConnected = expectedTotal > 0 && connectedCount === expectedTotal && (tournamentsCtx?.isSocketConnected ?? true);
  const pillColor = allConnected ? "bg-green-500" : "bg-red-600";

  // Hide entirely if no tournament context and no id hint
  const shouldRender = Boolean(tournamentsCtx && (tournamentsCtx.currentTournament || tournamentId));
  if (!shouldRender) return null;

  const posClass = position === "top-right"
    ? "top-3 right-3"
    : "bottom-3 left-3";

  // Helper: offline since formatted string
  const fmtSince = (ts: number) => {
    const now = Date.now();
    const delta = Math.max(0, now - (Number(ts) || 0));
    const s = Math.floor(delta / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  };

  return (
    <div
      className={`fixed ${posClass} z-[3000] select-none`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Summary pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow ring-1 ring-white/15 text-white/90 backdrop-blur-sm bg-black/60 hover:bg-black/70`}
        title="Show player connections"
        aria-label="Tournament presence"
        >
        <span className={`inline-block w-2 h-2 rounded-full ${pillColor}`} />
        <span className="text-sm whitespace-nowrap">
          {connectedCount}/{expectedTotal} Connected
        </span>
      </button>
      {/* Details popover */}
      {open && (
        <div className={`mt-2 w-64 rounded-lg bg-black/85 ring-1 ring-white/15 shadow-xl p-2 text-white/90`}>
          <div className="text-xs opacity-80 mb-2">Tournament Players</div>
          <div className="grid gap-1.5 max-h-60 overflow-auto pr-1">
            {roster.map((p, i) => (
              <div key={`${p.playerId}-${i}`} className="flex items-center justify-between gap-2 bg-white/5 rounded px-2 py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-block w-2 h-2 rounded-full ${p.isConnected ? 'bg-green-400' : 'bg-red-500'}`} />
                  <span className="truncate text-sm">
                    {typeof p.seatNumber === 'number' ? `S${p.seatNumber} ` : ''}
                    {p.playerName}
                  </span>
                </div>
                {!p.isConnected && (
                  <div className="text-[11px] text-white/70 whitespace-nowrap" title={new Date(p.lastActivity || 0).toLocaleString()}>
                    {`offline ${fmtSince(p.lastActivity)} ago`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

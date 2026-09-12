"use client";

import { useMemo } from "react";
import { PanelHeader } from "@/components/ui/page-header";
import { useRealtimeTournamentsOptional } from "@/contexts/RealtimeTournamentContext";

interface Props {
  tournamentId?: string | null;
}

export default function TournamentRoster({ tournamentId }: Props) {
  const rt = useRealtimeTournamentsOptional();
  const t =
    rt?.currentTournament &&
    (!tournamentId || rt.currentTournament.id === tournamentId)
      ? rt.currentTournament
      : null;
  const tId = tournamentId ?? t?.id ?? null;
  const stats = t && rt?.statistics ? rt.statistics : null;
  const presence = useMemo(
    () =>
      (tId && rt?.getPresenceFor
        ? rt.getPresenceFor(tId)
        : rt?.tournamentPresence) ?? [],
    [rt, tId],
  );

  const registered = useMemo(() => {
    const r = (
      t as unknown as {
        registeredPlayers?: Array<{
          id: string;
          displayName?: string;
          ready?: boolean;
          deckSubmitted?: boolean;
        }>;
      }
    )?.registeredPlayers;
    return Array.isArray(r) ? r : [];
  }, [t]);

  const activeRoundNumber = useMemo(() => {
    const r = (stats?.rounds || []).find(
      (x: unknown) => (x as { status?: string }).status === "active",
    ) as { roundNumber?: number } | undefined;
    return typeof r?.roundNumber === "number" ? r.roundNumber : null;
  }, [stats?.rounds]);

  const players = useMemo(() => {
    const byIdPresence = new Map<string, { isConnected: boolean }>();
    for (const p of presence as Array<{
      playerId: string;
      isConnected: boolean;
    }>) {
      byIdPresence.set(p.playerId, { isConnected: p.isConnected });
    }
    const format = (t as { format?: string } | null)?.format ?? "constructed";
    const status = (t as { status?: string } | null)?.status ?? "registering";
    const list = registered.map((p) => {
      let state = "joining";
      if (status === "preparing") {
        const ready = Boolean(
          (p as { ready?: boolean }).ready ||
          (p as { deckSubmitted?: boolean }).deckSubmitted,
        );
        if (ready) state = "ready";
        else if (format === "draft") state = "drafting";
        else if (format === "constructed" || format === "sealed")
          state = "constructing deck";
      } else if (status === "active") {
        const matches = Array.isArray(stats?.matches)
          ? (stats?.matches as Array<{
              id: string;
              roundNumber?: number | null;
              status?: string;
              players: Array<{ id: string; name?: string }>;
            }>)
          : [];
        const my = matches.find(
          (m) =>
            (activeRoundNumber == null ||
              m.roundNumber === activeRoundNumber) &&
            Array.isArray(m.players) &&
            m.players.some((pp) => pp.id === p.id),
        );
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
        name: p.displayName || p.id,
        isConnected: pres,
        state,
      };
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [registered, presence, t, stats?.matches, activeRoundNumber]);

  if (!tId) return null;

  return (
    <section className="rc-panel">
      <PanelHeader title="Players" meta={`${players.length} registered`} />
      <div className="thin-scrollbar max-h-72 overflow-y-auto px-[18px] py-3.5">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-rc-md px-2 py-1.5 transition-colors hover:bg-rc-accent/6"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-rc-md border border-rc-line/18 bg-black/30 font-rc-mono text-[13px] text-rc-fg-muted"
              >
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span
                className={`rc-dot shrink-0 ${p.isConnected ? "text-rc-success" : "text-rc-fg-dim"}`}
                title={p.isConnected ? "online" : "offline"}
              />
              <span className="truncate font-rc-mono text-sm font-semibold text-rc-fg-strong">
                {p.name}
              </span>
            </div>
            <div
              className={`ml-3 whitespace-nowrap font-rc-mono text-[11px] uppercase tracking-[0.12em] ${stateToneClass(p.state)}`}
            >
              {p.state}
            </div>
          </div>
        ))}
        {players.length === 0 && (
          <div className="rc-hint py-6 text-center">no players yet</div>
        )}
      </div>
    </section>
  );
}

/** Mono state label colour: ready is green, idle states quiet, rest amber. */
function stateToneClass(state: string): string {
  if (state === "ready") return "text-rc-success";
  if (state === "joining" || state === "waiting") return "text-rc-fg-subtle";
  return "text-rc-warning";
}

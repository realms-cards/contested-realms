"use client";

import { RcEmpty } from "@/components/ui/rc-empty";

interface Standing {
  playerId: string;
  displayName: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
  gameWinPercentage: number;
  opponentMatchWinPercentage: number;
  isEliminated: boolean;
}

interface Props {
  standings: Standing[];
}

export function OpenTournamentStandings({ standings }: Props) {
  if (standings.length === 0) {
    return (
      <RcEmpty title="No standings yet.">
        add players and complete matches to see standings
      </RcEmpty>
    );
  }

  return (
    <section className="rc-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="rc-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th>Pts</th>
              <th>GW%</th>
              <th>OMW%</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => (
              <tr
                key={standing.playerId}
                className={standing.isEliminated ? "opacity-50" : ""}
              >
                <td className="text-rc-fg-dim tabular-nums">{index + 1}</td>
                <td className="text-rc-fg-strong">
                  {standing.displayName}
                  {standing.isEliminated && (
                    <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-rc-danger">
                      (removed)
                    </span>
                  )}
                </td>
                <td className="tabular-nums text-rc-success">
                  {standing.wins}
                </td>
                <td className="tabular-nums text-rc-danger">
                  {standing.losses}
                </td>
                <td className="tabular-nums text-rc-fg-subtle">
                  {standing.draws}
                </td>
                <td className="rc-stat">{standing.matchPoints}</td>
                <td className="tabular-nums text-rc-fg-subtle">
                  {(standing.gameWinPercentage * 100).toFixed(1)}%
                </td>
                <td className="tabular-nums text-rc-fg-subtle">
                  {(standing.opponentMatchWinPercentage * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

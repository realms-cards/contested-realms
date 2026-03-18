"use client";

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
      <div className="text-center py-8 text-slate-400">
        No standings yet. Add players and complete matches to see standings.
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-700/50 text-slate-300">
            <th className="text-left px-4 py-2 font-medium">#</th>
            <th className="text-left px-4 py-2 font-medium">Player</th>
            <th className="text-center px-4 py-2 font-medium">W</th>
            <th className="text-center px-4 py-2 font-medium">L</th>
            <th className="text-center px-4 py-2 font-medium">D</th>
            <th className="text-center px-4 py-2 font-medium">Pts</th>
            <th className="text-center px-4 py-2 font-medium">GW%</th>
            <th className="text-center px-4 py-2 font-medium">OMW%</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => (
            <tr
              key={standing.playerId}
              className={`border-t border-slate-700 ${
                standing.isEliminated ? "opacity-50" : ""
              }`}
            >
              <td className="px-4 py-2 text-slate-400">{index + 1}</td>
              <td className="px-4 py-2 text-white">
                {standing.displayName}
                {standing.isEliminated && (
                  <span className="ml-2 text-xs text-red-400">(removed)</span>
                )}
              </td>
              <td className="text-center px-4 py-2 text-green-400">
                {standing.wins}
              </td>
              <td className="text-center px-4 py-2 text-red-400">
                {standing.losses}
              </td>
              <td className="text-center px-4 py-2 text-slate-400">
                {standing.draws}
              </td>
              <td className="text-center px-4 py-2 text-white font-medium">
                {standing.matchPoints}
              </td>
              <td className="text-center px-4 py-2 text-slate-400">
                {(standing.gameWinPercentage * 100).toFixed(1)}%
              </td>
              <td className="text-center px-4 py-2 text-slate-400">
                {(standing.opponentMatchWinPercentage * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

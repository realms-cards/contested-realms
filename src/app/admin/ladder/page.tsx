import "server-only";
import { GameFormat, TimeFrame as DbTimeFrame } from "@prisma/client";
import LadderRecomputeButton from "@/components/admin/LadderRecomputeButton";
import { requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

const FORMATS = ["constructed", "sealed", "draft"] as const;
const TIMEFRAMES = ["all_time", "monthly", "weekly"] as const;

// Mirrors LADDER.INACTIVE_AFTER_MS in server/modules/leaderboard/rating-model.ts.
const INACTIVE_AFTER_MS = 60 * 24 * 60 * 60 * 1000;

type Format = typeof FORMATS[number];
type TimeFrame = typeof TIMEFRAMES[number];

function getParam<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const v = Array.isArray(value) ? value[0] : value;
  return allowed.includes((v as T) ?? (fallback as T)) ? ((v as T) ?? fallback) : fallback;
}

export default async function AdminLadderPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[]>> }) {
  await requireAdminSession();

  const sp = (await searchParams) ?? {};
  const fmt: GameFormat = getParam<Format>(sp?.format, FORMATS, "constructed") as GameFormat;
  const tf: DbTimeFrame = getParam<TimeFrame>(sp?.timeFrame, TIMEFRAMES, "all_time") as DbTimeFrame;

  // Admins see the ranked list and, separately, players hidden for inactivity
  // (rank 0). Querying them apart keeps a large inactive population from
  // crowding ranked players out of the page limit.
  const include = { player: { select: { isGuest: true, ladderExcluded: true } } } as const;
  const [ranked, hidden, rankedCount, hiddenCount] = await Promise.all([
    prisma.leaderboardEntry.findMany({
      where: { format: fmt, timeFrame: tf, rank: { gt: 0 } },
      orderBy: { rank: "asc" },
      take: 200,
      include,
    }),
    prisma.leaderboardEntry.findMany({
      where: { format: fmt, timeFrame: tf, rank: 0 },
      orderBy: [{ rating: "desc" }, { wins: "desc" }],
      take: 100,
      include,
    }),
    prisma.leaderboardEntry.count({ where: { format: fmt, timeFrame: tf, rank: { gt: 0 } } }),
    prisma.leaderboardEntry.count({ where: { format: fmt, timeFrame: tf, rank: 0 } }),
  ]);
  const entries = [...ranked, ...hidden];

  const activeSince = Date.now() - INACTIVE_AFTER_MS;
  const isInactive = (lastRatedAt: Date | null) => lastRatedAt === null || lastRatedAt.getTime() < activeSince;

  const linkTo = (format: string, timeFrame: string) => `/admin/ladder?format=${encodeURIComponent(format)}&timeFrame=${encodeURIComponent(timeFrame)}`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Admin: Ladder</h1>
          <p className="text-sm text-slate-400">
            Ratings are replayed from match history by the socket server (startup, every 10 min, after each match).
            Players with no rated game in 60 days are hidden from the public list but keep their rating.
            Unrate a match or exclude a player via <code className="text-slate-300">POST /api/admin/ladder</code>.
          </p>
        </div>
        <LadderRecomputeButton />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">Format:</span>
          {FORMATS.map((f) => (
            <a
              key={f}
              className={`text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 ${f === fmt ? "bg-slate-800" : "hover:bg-slate-800/50"}`}
              href={linkTo(f, tf)}
            >
              {f}
            </a>
          ))}
        </div>
        <div className="ml-4 flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">Time frame:</span>
          {TIMEFRAMES.map((t) => (
            <a
              key={t}
              className={`text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 ${t === tf ? "bg-slate-800" : "hover:bg-slate-800/50"}`}
              href={linkTo(fmt, t)}
            >
              {t}
            </a>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {rankedCount} ranked · {hiddenCount} hidden (inactive)
        </span>
      </div>

      <div className="overflow-x-auto rounded border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-sm text-slate-200">
          <thead className="bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left">Rating</th>
              <th className="px-3 py-2 text-left">W</th>
              <th className="px-3 py-2 text-left">L</th>
              <th className="px-3 py-2 text-left">D</th>
              <th className="px-3 py-2 text-left">Win Rate</th>
              <th className="px-3 py-2 text-left">Opps</th>
              <th className="px-3 py-2 text-left">Rated</th>
              <th className="px-3 py-2 text-left">Prov</th>
              <th className="px-3 py-2 text-left">Last Rated</th>
              <th className="px-3 py-2 text-left">Flags</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const inactive = isInactive(e.lastRatedAt);
              return (
                <tr
                  key={e.id}
                  className={`border-t border-slate-800/60 ${i % 2 ? "bg-slate-900/40" : "bg-slate-900/60"} ${inactive ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2">{e.rank > 0 ? e.rank : "—"}</td>
                  <td className="px-3 py-2">
                    {e.displayName}
                    <span className="ml-2 text-[10px] text-slate-500">{e.playerId}</span>
                  </td>
                  <td className="px-3 py-2">{e.rating}</td>
                  <td className="px-3 py-2">{e.wins}</td>
                  <td className="px-3 py-2">{e.losses}</td>
                  <td className="px-3 py-2">{e.draws}</td>
                  <td className="px-3 py-2">{(e.winRate * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{e.uniqueOpponents}</td>
                  <td className="px-3 py-2">{e.ratedGames}</td>
                  <td className="px-3 py-2">{e.provisional ? "yes" : ""}</td>
                  <td className="px-3 py-2">{e.lastRatedAt ? new Date(e.lastRatedAt).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-xs text-amber-300">
                    {[
                      inactive ? "inactive" : null,
                      e.player.isGuest ? "guest" : null,
                      e.player.ladderExcluded ? "excluded" : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-slate-400">No entries</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

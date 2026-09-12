import "server-only";
import { GameFormat, TimeFrame as DbTimeFrame } from "@prisma/client";
import LadderRecomputeButton from "@/components/admin/LadderRecomputeButton";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
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

const FILTER_LINK =
  "rounded-rc-sm border px-2.5 py-1 font-rc-mono text-[11px] uppercase tracking-[0.14em] transition-colors";

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
    <div className="space-y-6">
      <PageHeader
        eyebrow="admin"
        title="Ladder"
        description={
          <>
            Ratings are replayed from match history by the socket server (startup, every 10 min, after each match).
            Players with no rated game in 60 days are hidden from the public list but keep their rating.
            Unrate a match or exclude a player via{" "}
            <code className="rounded-rc-sm border border-rc-line/12 bg-black/45 px-1 font-rc-mono text-xs text-rc-accent-link">
              POST /api/admin/ladder
            </code>
            .
          </>
        }
        actions={<LadderRecomputeButton />}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rc-eyebrow">Format</span>
          {FORMATS.map((f) => (
            <a
              key={f}
              className={`${FILTER_LINK} ${f === fmt ? "border-rc-accent/45 bg-rc-accent/16 text-rc-accent-link" : "border-rc-line/22 text-rc-fg-muted hover:border-rc-accent hover:text-rc-accent-ring"}`}
              href={linkTo(f, tf)}
            >
              {f}
            </a>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rc-eyebrow">Time frame</span>
          {TIMEFRAMES.map((t) => (
            <a
              key={t}
              className={`${FILTER_LINK} ${t === tf ? "border-rc-accent/45 bg-rc-accent/16 text-rc-accent-link" : "border-rc-line/22 text-rc-fg-muted hover:border-rc-accent hover:text-rc-accent-ring"}`}
              href={linkTo(fmt, t)}
            >
              {t}
            </a>
          ))}
        </div>
        <span className="rc-hint ml-auto">
          {rankedCount} ranked · {hiddenCount} hidden (inactive)
        </span>
      </div>

      <section className="rc-panel overflow-hidden">
        <PanelHeader
          title="Leaderboard"
          meta={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        />
        <div className="overflow-x-auto">
          <table className="rc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Rating</th>
                <th>W</th>
                <th>L</th>
                <th>D</th>
                <th>Win Rate</th>
                <th>Opps</th>
                <th>Rated</th>
                <th>Prov</th>
                <th>Last Rated</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const inactive = isInactive(e.lastRatedAt);
                return (
                <tr key={e.id} className={inactive ? "opacity-60" : undefined}>
                  <td className="text-rc-fg-dim">{e.rank > 0 ? e.rank : "—"}</td>
                  <td>
                    <span className="text-rc-fg-strong">{e.displayName}</span>
                    <span className="rc-hint ml-2">{e.playerId}</span>
                  </td>
                  <td className="rc-stat">{e.rating}</td>
                  <td className="tabular-nums">{e.wins}</td>
                  <td className="tabular-nums">{e.losses}</td>
                  <td className="tabular-nums">{e.draws}</td>
                  <td className="tabular-nums">{(e.winRate * 100).toFixed(1)}%</td>
                  <td className="tabular-nums">{e.uniqueOpponents}</td>
                  <td className="tabular-nums">{e.ratedGames}</td>
                  <td className="font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-warning">{e.provisional ? "yes" : ""}</td>
                  <td className="text-rc-fg-muted">{e.lastRatedAt ? new Date(e.lastRatedAt).toLocaleDateString() : "—"}</td>
                  <td className="font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-warning">
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
                  <td colSpan={12} className="py-6 text-center text-rc-fg-subtle">No entries</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

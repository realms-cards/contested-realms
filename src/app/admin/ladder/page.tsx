import "server-only";
import { GameFormat, TimeFrame as DbTimeFrame } from "@prisma/client";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { requireAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";

const FORMATS = ["constructed", "sealed", "draft"] as const;
const TIMEFRAMES = ["all_time", "monthly", "weekly"] as const;

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
  const tf: DbTimeFrame = getParam<TimeFrame>(sp?.timeFrame, TIMEFRAMES, "monthly") as DbTimeFrame;

  const entries = await prisma.leaderboardEntry.findMany({
    where: { format: fmt, timeFrame: tf },
    orderBy: [{ rating: "desc" }, { wins: "desc" }],
    take: 100,
  });

  const linkTo = (format: string, timeFrame: string) => `/admin/ladder?format=${encodeURIComponent(format)}&timeFrame=${encodeURIComponent(timeFrame)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="admin"
        title="Ladder"
        description="Format and time frame filters"
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
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id}>
                  <td className="text-rc-fg-dim">{i + 1}</td>
                  <td className="text-rc-fg-strong">{e.displayName}</td>
                  <td className="rc-stat">{e.rating}</td>
                  <td className="tabular-nums">{e.wins}</td>
                  <td className="tabular-nums">{e.losses}</td>
                  <td className="tabular-nums">{e.draws}</td>
                  <td className="tabular-nums">{(e.winRate * 100).toFixed(1)}%</td>
                  <td className="text-rc-fg-muted">{new Date(e.lastActive).toLocaleString()}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-rc-fg-subtle">No entries</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

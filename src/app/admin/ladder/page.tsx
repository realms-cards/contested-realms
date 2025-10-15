import "server-only";
import { GameFormat, TimeFrame as DbTimeFrame } from "@prisma/client";
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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-white">Admin: Ladder</h1>
        <p className="text-sm text-slate-400">Format and time frame filters</p>
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
              <th className="px-3 py-2 text-left">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id} className={`border-t border-slate-800/60 ${i % 2 ? "bg-slate-900/40" : "bg-slate-900/60"}`}>
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">{e.displayName}</td>
                <td className="px-3 py-2">{e.rating}</td>
                <td className="px-3 py-2">{e.wins}</td>
                <td className="px-3 py-2">{e.losses}</td>
                <td className="px-3 py-2">{e.draws}</td>
                <td className="px-3 py-2">{(e.winRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">{new Date(e.lastActive).toLocaleString()}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">No entries</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

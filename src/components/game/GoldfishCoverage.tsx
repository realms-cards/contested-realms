"use client";

import { goldfishCoverage, type GoldfishDeckSnapshot } from "@/lib/game/cpu/goldfishTesting";

export default function GoldfishCoverage({snapshot,busy,error,onConfirm,onBack}: {
  snapshot: GoldfishDeckSnapshot; busy: boolean; error: string | null; onConfirm: () => void; onBack: () => void;
}) {
  const entries = goldfishCoverage(snapshot.deck);
  return <section className="w-full max-w-2xl rounded-2xl bg-zinc-900 p-6 text-white space-y-4">
    <h2 className="font-fantaisie text-2xl">Automation coverage — {snapshot.name}</h2>
    <p className="text-sm text-amber-200">This is not a rules-completeness guarantee. Spell resolvers can have interaction gaps. Basic board controls remain available for manual resolution.</p>
    {([
      ["automated","Spell resolver available","These Magic cards have a shared CPU spell resolver."],
      ["partial","Partial support","Precon cards with some implemented rules; abilities and interactions may still need manual help."],
      ["manual","Manual / unverified","No complete automation is claimed for these cards. Review their effects yourself."],
    ] as const).map(([level,title,description]) => {
      const group = entries.filter(entry => entry.level === level);
      return <details key={level} open={level === "manual" && group.length>0} className="rounded border border-slate-700 p-3">
        <summary className="cursor-pointer">{title}: {group.reduce((sum,entry) => sum+entry.count,0)} cards</summary>
        <p className="my-2 text-sm text-slate-300">{description}</p>
        <ul className="max-h-48 overflow-auto text-sm">{group.map(entry => <li key={entry.name}>{entry.count} × {entry.name}</li>)}</ul>
      </details>;
    })}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="flex gap-3">
      <button disabled={busy} onClick={onBack} className="rounded bg-slate-700 px-4 py-2 disabled:opacity-50">Choose another deck</button>
      <button disabled={busy} onClick={onConfirm} className="rounded bg-indigo-600 px-4 py-2 disabled:opacity-50">{busy ? "Loading…" : "Load deck and continue"}</button>
    </div>
  </section>;
}

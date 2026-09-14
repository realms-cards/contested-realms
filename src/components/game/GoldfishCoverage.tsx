"use client";

import { RcButton } from "@/components/ui/rc-button";
import { goldfishCoverage, type GoldfishDeckSnapshot } from "@/lib/game/cpu/goldfishTesting";

export default function GoldfishCoverage({snapshot,busy,error,onConfirm,onBack}: {
  snapshot: GoldfishDeckSnapshot; busy: boolean; error: string | null; onConfirm: () => void; onBack: () => void;
}) {
  const entries = goldfishCoverage(snapshot.deck);
  return <section className="w-full max-w-2xl space-y-4 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-6 text-rc-fg shadow-rc-panel">
    <h2 className="m-0 font-rc-display text-[28px] leading-[1.1] text-rc-fg-strong">Automation coverage — {snapshot.name}</h2>
    <p className="rc-alert" data-tone="warning">This is not a rules-completeness guarantee. Spell resolvers can have interaction gaps. Basic board controls remain available for manual resolution.</p>
    {([
      ["automated","Spell resolver available","These Magic cards have a shared CPU spell resolver."],
      ["partial","Partial support","Precon cards with some implemented rules; abilities and interactions may still need manual help."],
      ["manual","Manual / unverified","No complete automation is claimed for these cards. Review their effects yourself."],
    ] as const).map(([level,title,description]) => {
      const group = entries.filter(entry => entry.level === level);
      return <details key={level} open={level === "manual" && group.length>0} className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
        <summary className="cursor-pointer font-rc-sans text-sm font-medium text-rc-fg-strong">{title}: {group.reduce((sum,entry) => sum+entry.count,0)} cards</summary>
        <p className="my-2 font-rc-sans text-sm text-rc-fg-muted">{description}</p>
        <ul className="thin-scrollbar max-h-48 overflow-auto font-rc-mono text-[13px] text-rc-fg">{group.map(entry => <li key={entry.name}><span className="tabular-nums text-rc-fg-subtle">{entry.count} ×</span> {entry.name}</li>)}</ul>
      </details>;
    })}
    {error && <p role="alert" className="rc-alert" data-tone="danger">{error}</p>}
    <div className="flex flex-wrap gap-3">
      <RcButton variant="outline" disabled={busy} onClick={onBack}>Choose another deck</RcButton>
      <RcButton disabled={busy} onClick={onConfirm}>{busy ? "Loading…" : "Load deck and continue"}</RcButton>
    </div>
  </section>;
}

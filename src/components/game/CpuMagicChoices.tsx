"use client";

import { cardText, getSpellChoices, projectileKey, supportsSpell } from "@/lib/game/cpu/spells";
import { useGameStore } from "@/lib/game/store";
import type { PendingMagic } from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

export default function CpuMagicChoices() {
  const state = useGameStore();
  const pending = state.pendingMagic;
  if (!pending) return null;
  const seat = seatFromOwner(pending.spell.owner);
  const choices = getSpellChoices(state, seat, pending.spell.card.name || "", pending.cpuChoice);
  const selected = choices.find(choice => choice.key === pending.cpuChoice);
  const canChoose = state.actorKey === seat && pending.status !== "confirm";
  const eventLabels: Record<NonNullable<PendingMagic["cpuEvent"]>["kind"], string> = {
    projectileImpact:"Choose the next projectile impact",
    geomancerFill:"Fill adjacent void with Rubble",
    treasurePlace:"Opponent chooses underwater placement",treasureRecover:"Recover treasure",drawChoice:"Choose a deck to draw from",
    randomChoice:"Choose a random outcome",fightChoice:pending.cpuEvent?.kind === "fightChoice" && pending.cpuEvent.strikeOnly ? "Strike after arrival" : "Fight after arrival",genesis:"Genesis",auraEnd:"End-phase effect",blazeTrail:"Blaze trail",
  };
  const eventLabel = pending.cpuEvent ? eventLabels[pending.cpuEvent.kind] : "";
  return (
    <div className="absolute bottom-24 left-1/2 z-50 max-h-[65vh] w-[min(92vw,44rem)] -translate-x-1/2 overflow-y-auto rounded-xl border border-amber-200/25 bg-slate-950/95 p-4 text-white shadow-xl pointer-events-auto">
      <div className="font-fantaisie text-xl text-amber-100">{pending.spell.card.name}{eventLabel ? ` — ${eventLabel}` : ""}</div>
      {!pending.cpuEvent && !supportsSpell(pending.spell.card.name || "") ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-amber-200">Manual effect required. The CPU will wait while you resolve it using the board controls.</p>
          <p className="whitespace-pre-line">{pending.summaryText || cardText(pending.spell.card)}</p>
          {state.actorKey === seat && <div className="flex justify-end gap-2">
            <button className="rounded bg-slate-700 px-3 py-2" onClick={state.cancelMagic}>Cancel</button>
            <button className="rounded bg-emerald-700 px-3 py-2" onClick={state.completeCpuMagicManual}>I have resolved the effect</button>
          </div>}
        </div>
      ) : canChoose ? (
        <div className="mt-3 space-y-3">
          <label className="block text-sm" htmlFor="cpu-spell-choice">Spellcaster and effect</label>
          <select id="cpu-spell-choice" className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm"
            value={selected?.key || ""} onChange={event => state.setCpuMagicChoice(event.target.value)}>
            <option value="">Choose how to cast this spell…</option>
            {choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
          </select>
          {selected?.projectile?.decisions.map((decision, index) => (
            <label key={index} className="block text-sm">
              {decision.label}
              <select className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
                value={selected.projectile?.selections[index]}
                onChange={event => {
                  const plan = selected.projectile;
                  if (!plan) return;
                  const selections = [...plan.selections];
                  selections[index] = event.target.value;
                  const key = projectileKey(plan.baseKey, selections);
                  const updated = getSpellChoices(state, seat, pending.spell.card.name || "", key)
                    .find(choice => choice.projectile?.baseKey === plan.baseKey);
                  if (updated) state.setCpuMagicChoice(updated.key);
                }}>
                {decision.options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
          ))}
          {choices.length === 0 && <p className="text-sm text-amber-200">There are no legal choices in the current position.</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-40" disabled={!!pending.cpuRandomMinion || !!pending.cpuEvent} onClick={state.cancelMagic}>Cancel</button>
            <button className="rounded bg-emerald-700 px-3 py-2 text-sm disabled:opacity-40" disabled={!selected} onClick={state.confirmMagic}>Confirm effect</button>
          </div>
        </div>
      ) : <p className="mt-2 text-sm text-slate-200" aria-live="polite">{selected?.label || "Choosing a spellcaster and effect…"}{pending.status === "confirm" ? " — Resolving…" : ""}</p>}
    </div>
  );
}

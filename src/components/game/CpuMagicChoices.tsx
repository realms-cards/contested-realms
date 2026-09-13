"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import CpuFieldChoices from "@/components/game/CpuFieldChoices";
import type { SpellChoice, SpellState } from "@/lib/game/cpu/spellTypes";
import { cardText, getSpellChoices, projectileKey, supportsSpell } from "@/lib/game/cpu/spells";
import { useGameStore } from "@/lib/game/store";
import type { GameState, PendingMagic } from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

/** Every GameState field getSpellChoices reads, including the lazily required genesis,
 * treasure, timed aura, blaze/movement and label helpers. pendingMagic supplies the
 * event, the Raise Dead outcomes and the spell; its cpuChoice is the selection key. */
type MagicRulesState = SpellState & {pendingMagic: PendingMagic};
const NO_CHOICES: SpellChoice[] = [];

const selectView = (state: GameState) => ({pending:state.pendingMagic,actorKey:state.actorKey,matchId:state.matchId,setCpuMagicChoice:state.setCpuMagicChoice,
  cancelMagic:state.cancelMagic,confirmMagic:state.confirmMagic,completeCpuMagicManual:state.completeCpuMagicManual});

/** Null while no choice is displayed: a manual effect, or another seat that has not announced its choice yet. */
function selectRules(state: GameState): MagicRulesState | null {
  const pending = state.pendingMagic;
  if (!pending || (!pending.cpuEvent && !supportsSpell(pending.spell.card.name || ""))) return null;
  const chooser = state.actorKey === seatFromOwner(pending.spell.owner) && pending.status !== "confirm";
  if (!chooser && !pending.cpuChoice) return null;
  return {pendingMagic:pending,pendingCombat:state.pendingCombat,board:state.board,permanents:state.permanents,permanentPositions:state.permanentPositions,
    avatars:state.avatars,players:state.players,zones:state.zones,turn:state.turn,currentPlayer:state.currentPlayer};
}

export default function CpuMagicChoices() {
  const {pending,actorKey,matchId,setCpuMagicChoice,cancelMagic,confirmMagic,completeCpuMagicManual} = useGameStore(useShallow(selectView));
  const rules = useGameStore(useShallow(selectRules));
  const choices = useMemo(() => rules ? getSpellChoices(rules,seatFromOwner(rules.pendingMagic.spell.owner),rules.pendingMagic.spell.card.name || "",rules.pendingMagic.cpuChoice) : NO_CHOICES,[rules]);
  if (!pending) return null;
  const seat = seatFromOwner(pending.spell.owner);
  const selected = choices.find(choice => choice.key === pending.cpuChoice);
  const canChoose = actorKey === seat && pending.status !== "confirm";
  const eventLabels: Record<NonNullable<PendingMagic["cpuEvent"]>["kind"], string> = {
    unitEnd:"End-of-turn projectile",
    projectileImpact:"Choose the next projectile impact",
    geomancerFill:"Fill adjacent void with Rubble",
    treasurePlace:"Opponent chooses underwater placement",treasureRecover:"Recover treasure",drawChoice:"Choose a deck to draw from",
    randomChoice:"Choose a random outcome",fightChoice:pending.cpuEvent?.kind === "fightChoice" && pending.cpuEvent.strikeOnly ? "Strike after arrival" : "Fight after arrival",genesis:"Genesis",auraEnd:"End-phase effect",blazeTrail:"Blaze trail",
  };
  const eventLabel = pending.cpuEvent ? eventLabels[pending.cpuEvent.kind] : "";
  return (
    <div className="absolute bottom-14 lg:bottom-24 left-1/2 z-50 max-h-[60vh] w-[min(92vw,44rem)] -translate-x-1/2 overflow-y-auto rounded-xl border border-amber-200/25 bg-slate-950/95 p-4 text-white shadow-xl pointer-events-auto">
      <div className="font-fantaisie text-xl text-amber-100">{pending.spell.card.name}{eventLabel ? ` — ${eventLabel}` : ""}</div>
      {!pending.cpuEvent && !supportsSpell(pending.spell.card.name || "") ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-amber-200">Manual effect required. The CPU will wait while you resolve it using the board controls.</p>
          <p className="whitespace-pre-line">{pending.summaryText || cardText(pending.spell.card)}</p>
          {actorKey === seat && <div className="flex justify-end gap-2">
            <button className="rounded bg-slate-700 px-3 py-2" onClick={cancelMagic}>Cancel</button>
            <button className="rounded bg-emerald-700 px-3 py-2" onClick={completeCpuMagicManual}>I have resolved the effect</button>
          </div>}
        </div>
      ) : canChoose ? (
        <div className="mt-3 space-y-3">
          <label className="block text-sm" htmlFor="cpu-spell-choice">Spellcaster and effect</label>
          <CpuFieldChoices id="cpu-spell-choice" request={`${matchId}:${pending.id}`} choices={choices} value={selected?.key || ""} onChange={setCpuMagicChoice} />
          {selected?.projectile?.decisions.map((decision, index) => (
            <label key={index} className="block text-sm">
              {decision.label}
              <select className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
                value={selected.projectile?.selections[index]}
                onChange={event => {
                  const plan = selected.projectile;
                  if (!plan || !rules) return;
                  const selections = [...plan.selections];
                  selections[index] = event.target.value;
                  const key = projectileKey(plan.baseKey, selections);
                  const updated = getSpellChoices(rules, seat, pending.spell.card.name || "", key)
                    .find(choice => choice.projectile?.baseKey === plan.baseKey);
                  if (updated) setCpuMagicChoice(updated.key);
                }}>
                {decision.options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
          ))}
          {choices.length === 0 && <p className="text-sm text-amber-200">There are no legal choices in the current position.</p>}
          <div className="flex justify-end gap-2">
            <button className="rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-40" disabled={!!pending.cpuRandomMinion || !!pending.cpuEvent} onClick={cancelMagic}>Cancel</button>
            <button className="rounded bg-emerald-700 px-3 py-2 text-sm disabled:opacity-40" disabled={!selected} onClick={confirmMagic}>Confirm effect</button>
          </div>
        </div>
      ) : <p className="mt-2 text-sm text-slate-200" aria-live="polite">{selected?.label || "Choosing a spellcaster and effect…"}{pending.status === "confirm" ? " — Resolving…" : ""}</p>}
    </div>
  );
}

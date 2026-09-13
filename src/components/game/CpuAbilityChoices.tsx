"use client";

import React, { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import CpuFieldChoices from "@/components/game/CpuFieldChoices";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import type { SpellState } from "@/lib/game/cpu/spellTypes";
import { useGameStore } from "@/lib/game/store";
import type { GameState } from "@/lib/game/store/types";

/** Every GameState field abilityChoices reads, directly or through the shared spells.js helpers. */
type AbilityRulesState = SpellState & Pick<GameState,"phase" | "cpuPendingTriggerCount" | "cpuEffectContinuations">;
const NO_CHOICES: ReturnType<typeof abilityChoices> = [];
const NO_TRIGGERS: NonNullable<GameState["cpuTriggerOptions"]> = [];

const selectView = (state: GameState) => ({actorKey:state.actorKey,matchEnded:state.matchEnded,matchId:state.matchId,turn:state.turn,currentPlayer:state.currentPlayer,
  triggers:state.cpuTriggerOptions?.length ? state.cpuTriggerOptions : NO_TRIGGERS,chooseCpuTrigger:state.chooseCpuTrigger,activateCpuAbility:state.activateCpuAbility});

/** Rules inputs only while an ability can be activated: this mirrors the picker's own early
 * returns and abilityChoices' gate, which yield no choices in every other state. */
function selectRules(state: GameState): AbilityRulesState | null {
  const seat = state.actorKey;
  if (!seat || state.matchEnded || state.cpuTriggerOptions?.length || state.phase !== "Main" || state.currentPlayer !== (seat === "p1" ? 1 : 2) ||
    state.pendingMagic || state.pendingCombat || state.cpuPendingTriggerCount || state.cpuEffectContinuations?.length) return null;
  return {phase:state.phase,currentPlayer:state.currentPlayer,turn:state.turn,pendingMagic:state.pendingMagic,pendingCombat:state.pendingCombat,
    cpuPendingTriggerCount:state.cpuPendingTriggerCount,cpuEffectContinuations:state.cpuEffectContinuations,board:state.board,permanents:state.permanents,
    permanentPositions:state.permanentPositions,avatars:state.avatars,players:state.players,zones:state.zones};
}

export default function CpuAbilityChoices() {
  const {actorKey,matchEnded,matchId,turn,currentPlayer,triggers,chooseCpuTrigger,activateCpuAbility} = useGameStore(useShallow(selectView));
  const rules = useGameStore(useShallow(selectRules));
  const choices = useMemo(() => rules && actorKey ? abilityChoices(rules,actorKey) : NO_CHOICES,[rules,actorKey]);
  const [key,setKey] = useState("");
  const [selectionSession,setSelectionSession] = useState(0);
  if (!actorKey || matchEnded) return null;
  if (triggers.length) return <div className="absolute bottom-14 lg:bottom-24 left-1/2 max-h-[60vh] overflow-y-auto z-50 w-[min(92vw,38rem)] -translate-x-1/2 rounded-xl border border-amber-200/25 bg-slate-950/95 p-3 text-white pointer-events-auto">
    <p className="font-fantaisie text-lg text-amber-100">Choose your next trigger to resolve</p>
    {triggers.map(option => <button key={option.id} onClick={() => chooseCpuTrigger(option.id)} className="mt-2 block w-full rounded bg-indigo-700 p-2 text-left text-sm">{option.label}</button>)}
  </div>;
  if (!choices.length) return null;
  const selected = choices.find(choice => choice.key === key);
  return <div className="absolute bottom-14 lg:bottom-24 left-1/2 max-h-[60vh] overflow-y-auto z-40 w-[min(92vw,38rem)] -translate-x-1/2 rounded-xl border border-amber-200/25 bg-slate-950/95 p-3 text-white pointer-events-auto">
    <label htmlFor="cpu-ability" className="font-fantaisie text-lg text-amber-100">Activated abilities</label>
    <CpuFieldChoices key={selectionSession} manual id="cpu-ability" request={`${matchId}:ability:${turn}:${currentPlayer}`} choices={choices} value={selected?.key || ""} onChange={setKey} />
    <button disabled={!selected} onClick={() => { if (selected) activateCpuAbility(selected.key); setKey(""); setSelectionSession(value => value+1); }} className="rounded bg-indigo-600 px-3 py-2 text-sm disabled:opacity-40">Pay costs and resolve</button>
  </div>;
}

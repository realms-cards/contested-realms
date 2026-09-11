"use client";

import React, { useState } from "react";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import { useGameStore } from "@/lib/game/store";

export default function CpuAbilityChoices() {
  const state = useGameStore();
  const [key,setKey] = useState("");
  if (!state.actorKey || state.matchEnded) return null;
  if (state.cpuTriggerOptions?.length) return <div className="absolute bottom-24 left-1/2 z-50 w-[min(92vw,38rem)] -translate-x-1/2 rounded-xl border border-amber-200/25 bg-slate-950/95 p-3 text-white pointer-events-auto">
    <p className="font-fantaisie text-lg text-amber-100">Choose your next trigger to resolve</p>
    {state.cpuTriggerOptions.map(option => <button key={option.id} onClick={() => state.chooseCpuTrigger(option.id)} className="mt-2 block w-full rounded bg-indigo-700 p-2 text-left text-sm">{option.label}</button>)}
  </div>;
  const choices = abilityChoices(state,state.actorKey);
  if (!choices.length) return null;
  const selected = choices.find(choice => choice.key === key);
  return <div className="absolute bottom-24 left-1/2 z-40 w-[min(92vw,38rem)] -translate-x-1/2 rounded-xl border border-amber-200/25 bg-slate-950/95 p-3 text-white pointer-events-auto">
    <label htmlFor="cpu-ability" className="font-fantaisie text-lg text-amber-100">Activated abilities</label>
    <select id="cpu-ability" value={selected?.key || ""} onChange={event => setKey(event.target.value)} className="my-2 w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm">
      <option value="">Choose an ability and its costs…</option>
      {choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
    </select>
    <button disabled={!selected} onClick={() => { if (selected) state.activateCpuAbility(selected.key); setKey(""); }} className="rounded bg-indigo-600 px-3 py-2 text-sm disabled:opacity-40">Pay costs and resolve</button>
  </div>;
}

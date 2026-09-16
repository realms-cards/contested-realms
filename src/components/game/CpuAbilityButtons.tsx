"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { soundManager } from "@/lib/audio/soundManager";
import { useCpuAbilityPicker, useReadyAbilities } from "@/lib/game/cpu/abilityPicker";
import { useGameStore } from "@/lib/game/store";
import type { GameState } from "@/lib/game/store/types";
import { getCellNumber } from "@/lib/game/store/utils/boardHelpers";

const BTN = "relative flex min-w-0 items-center gap-1.5 px-3 py-2 font-rc-sans text-sm text-rc-moonlight transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-accent-ring";
const NOTICE_KEY = "sorcery:abilityReady";
/** Used only when sessionStorage is unavailable (private mode, blocked storage). */
const noticed = new Set<string>();

/** True the first time `key` (`${matchId}:${sourceId}`) is claimed in this browser session. */
function claimNotice(matchId: string, key: string): boolean {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(NOTICE_KEY) || "[]");
    const seen = Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
    if (seen.includes(key)) return false;
    // Only the current match's notices are kept.
    window.sessionStorage.setItem(NOTICE_KEY,JSON.stringify([...seen.filter(entry => entry.startsWith(`${matchId}:`)),key]));
    return true;
  } catch {
    if (noticed.has(key)) return false;
    noticed.add(key);
    return true;
  }
}

const selectCombatBar = (state: GameState) => !!(state.attackChoice || state.attackTargetChoice || state.attackConfirm);
const selectCpuMatch = (state: GameState) => state.opponentPlayerId?.startsWith("cpu_") === true && !!state.actorKey && !state.matchEnded;

/** Activated abilities next to Attack here | Ranged (CPU matches): one button per ready source. Nothing opens or
 * selects until a button is clicked; the first time a source becomes ready in a match, a toast and chime announce it. */
export default function CpuAbilityButtons() {
  const cpu = useGameStore(selectCpuMatch);
  const combatBar = useGameStore(selectCombatBar);
  const {matchId,request,sources,blocked,size} = useReadyAbilities();
  const picked = useCpuAbilityPicker(state => state.request === request ? state.picked : null);
  const hovered = useCpuAbilityPicker(state => state.request === request ? state.hovered : null);
  const [pulse,setPulse] = useState<{request: string; ids: string[]}>({request:"",ids:[]});
  const ids = sources.map(([id]) => id), idsKey = ids.join("|");

  useEffect(() => {
    if (!cpu || !matchId || !sources.length) return;
    const fresh = sources.filter(([id]) => claimNotice(matchId,`${matchId}:${id}`));
    if (!fresh.length) return;
    // One toast per batch: the board toast has a single slot, so separate toasts would overwrite each other.
    const names = [...new Set(fresh.map(([,source]) => source.card.name))];
    const list = names.length > 1 ? `${names.slice(0,-1).join(", ")} and ${names[names.length-1]}` : names[0];
    window.dispatchEvent(new CustomEvent("app:toast",{detail:{message:`${list} ${fresh.length > 1 ? "abilities" : "ability"} ready`}}));
    soundManager.play("consent");
    setPulse(prev => ({request,ids:[...(prev.request === request ? prev.ids : []),...fresh.map(([id]) => id)]}));
    // idsKey stands for sources: a realm change that keeps the same sources must not re-run the notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[cpu,matchId,request,idsKey]);

  if (!cpu) return null;
  const calm = (id: string) => setPulse(prev => prev.ids.includes(id) ? {...prev,ids:prev.ids.filter(entry => entry !== id)} : prev);
  const picker = useCpuAbilityPicker.getState();
  const tileNo = (at: string) => { const [x,y] = at.split(",").map(Number); return size ? getCellNumber(x,y,size.w,size.h) : at; };
  const group = "flex max-w-full flex-wrap overflow-hidden rounded-rc-md bg-[rgba(7,10,20,0.85)] shadow-rc-panel ring-1 ring-rc-moonlight/35";
  const icon = <Icon icon="game-icons:magic-swirl" width={16} height={16} className="shrink-0" />;
  if (!sources.length && !blocked.length) return <div role="group" aria-label="Activated abilities" className={group}>
    <button type="button" disabled className={`${BTN} bg-rc-moonlight/10`} title="None of your cards has an ability you can activate right now">{icon}Abilities</button>
  </div>;
  return <div role="group" aria-label="Activated abilities" className={group}>
    {sources.map(([id,source],index) => {
      const shared = sources.filter(([,other]) => other.card.name === source.card.name).length > 1;
      const on = picked === id, lit = on || hovered === id, pulsing = pulse.request === request && pulse.ids.includes(id);
      const leave = () => { if (useCpuAbilityPicker.getState().hovered === id) picker.hover(request,null); };
      return <button key={id} type="button" aria-pressed={on} disabled={combatBar} data-new={pulsing || undefined}
        aria-label={`${source.card.name} abilities, Tile #${tileNo(source.at)}`}
        title={combatBar ? "Finish the attack first" : `Use an ability of ${source.card.name}`}
        onClick={() => { calm(id); picker.pick(request,on ? null : id); }}
        onPointerEnter={() => { calm(id); picker.hover(request,id); }} onPointerLeave={leave}
        onFocus={() => { calm(id); picker.hover(request,id); }} onBlur={leave}
        className={`${BTN} ${index ? "border-l border-rc-moonlight/25" : ""} ${on ? "bg-rc-moonlight/25 text-rc-fg-strong" : lit ? "bg-rc-moonlight/18" : "bg-rc-moonlight/8 hover:bg-rc-moonlight/18"}`}>
        {pulsing && <span aria-hidden className="pointer-events-none absolute inset-0 bg-rc-moonlight/25 motion-safe:animate-pulse" />}
        {index === 0 && icon}
        <span className="max-w-[10rem] truncate font-rc-display">{source.card.name}</span>
        {shared && <span className="font-rc-mono text-xs tabular-nums text-rc-fg-subtle">#{tileNo(source.at)}</span>}
      </button>;
    })}
    {/* Tapped sources: shown disabled with the reason, rather than vanishing as if they had no ability. */}
    {blocked.map(([id,source,reason],index) => <button key={id} type="button" disabled
      aria-label={`${source.card.name} ability unavailable, Tile #${tileNo(source.at)}: ${reason}`}
      title={`${reason} — untap it (right-click it) to use its ability`}
      className={`${BTN} ${sources.length || index ? "border-l border-rc-moonlight/25" : ""} bg-rc-moonlight/8`}>
      {!sources.length && index === 0 && icon}
      <span className="max-w-[10rem] truncate font-rc-display">{source.card.name}</span>
      <span className="font-rc-sans text-xs text-rc-fg-subtle">tapped</span>
    </button>)}
  </div>;
}

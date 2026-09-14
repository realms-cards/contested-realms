import { create } from "zustand";
import type { CardRef, PlayerKey } from "@/lib/game/store/types";

/** What the CPU did with the revealed card. */
export type CpuRevealKind = "site" | "permanent" | "spell" | "ability" | "trigger";

export type CpuReveal = {
  /** Stable per play: a spell's magic id, an ability's request id, a card's instance id. */
  id: string;
  seat: PlayerKey;
  card: CardRef;
  kind: CpuRevealKind;
  /** e.g. "plays at Tile #8", "casts", "activates", "Genesis". */
  action: string;
  /** The effect label, filled in once known. */
  detail?: string | null;
};

type RevealTimer = {
  /** Increments whenever the countdown restarts, so a progress bar can restart with it. */
  run: number;
  /** Length of the current countdown run in ms. */
  ms: number;
  /** When the current reveal first became visible (for "visible long enough" checks). */
  shownAt: number;
};

type RevealState = {
  queue: CpuReveal[];
  /** Hover (mouse) holds the visible reveal open. */
  held: boolean;
  /** The tab is hidden: nobody can read the reveal, so its countdown stops. */
  hidden: boolean;
  timer: RevealTimer | null;
  show: (entry: CpuReveal) => void;
  update: (id: string, patch: Partial<Pick<CpuReveal, "detail" | "action" | "card">>) => void;
  hold: (held: boolean) => void;
  setHidden: (hidden: boolean) => void;
  dismiss: (id?: string) => void;
  reset: () => void;
};

/** How long each reveal stays up. */
export const CPU_REVEAL_MS = 4000;
/** An effect label that arrives late stays readable at least this long. */
export const CPU_REVEAL_DETAIL_MS = 2500;
/** After a hover or hidden tab ends, the reveal stays at least this long. */
export const CPU_REVEAL_RESUME_MS = 1000;
/** A CPU spell's auto-resolve waits until its reveal has been visible this long... */
export const CPU_SPELL_REVEAL_READ_MS = 1500;
/** ...but never more than this beyond its usual delay. */
export const CPU_SPELL_RESOLVE_MAX_WAIT_MS = 6000;
/** Bounded backlog; a runaway trigger chain drops its oldest waiting entries. */
export const CPU_REVEAL_MAX_QUEUE = 20;

let handle: ReturnType<typeof setTimeout> | null = null;
let deadline = 0;
let remaining = 0;
/** Ids shown and dismissed; a late update never brings them back. */
const finished = new Set<string>();

function stop() {
  if (handle) clearTimeout(handle);
  handle = null;
}

export const useCpuReveals = create<RevealState>()((set, get) => {
  const running = () => !get().held && !get().hidden;
  /** Re-arm the visible reveal's countdown; `restart` also restarts its progress bar. */
  const arm = (ms: number, restart: boolean) => {
    stop();
    remaining = ms;
    const current = get().timer;
    const head = get().queue[0];
    if (!head) { set({timer:null}); return; }
    if (restart || !current) set({timer:{run:(current?.run || 0)+1,ms,shownAt:current?.shownAt ?? Date.now()}});
    if (!running()) return;
    deadline = Date.now()+ms;
    handle = setTimeout(() => { handle = null; get().dismiss(head.id); }, ms);
  };
  /** The head of the queue changed: start its full countdown. */
  const showHead = () => {
    stop();
    const head = get().queue[0];
    if (!head) { set({timer:null}); return; }
    const run = (get().timer?.run || 0)+1;
    set({timer:{run,ms:CPU_REVEAL_MS,shownAt:Date.now()}});
    remaining = CPU_REVEAL_MS;
    if (!running()) return;
    deadline = Date.now()+CPU_REVEAL_MS;
    handle = setTimeout(() => { handle = null; get().dismiss(head.id); }, CPU_REVEAL_MS);
  };
  const pauseCountdown = () => {
    if (!handle) return;
    remaining = Math.max(0,deadline-Date.now());
    stop();
  };
  return {
    queue: [],
    held: false,
    hidden: false,
    timer: null,
    show: (entry) => {
      if (finished.has(entry.id)) return;
      const {queue} = get();
      const at = queue.findIndex(item => item.id === entry.id);
      if (at >= 0) {
        get().update(entry.id,{card:entry.card,action:entry.action,...(entry.detail ? {detail:entry.detail} : {})});
        return;
      }
      let next = [...queue,entry];
      // Drop the oldest waiting entries, never the visible one.
      while (next.length > CPU_REVEAL_MAX_QUEUE) next = [next[0],...next.slice(2)];
      set({queue:next});
      if (!queue.length) showHead();
    },
    update: (id, patch) => {
      const {queue} = get();
      const at = queue.findIndex(item => item.id === id);
      if (at < 0) return;
      const current = queue[at];
      const changedDetail = patch.detail !== undefined && patch.detail !== current.detail;
      const next = {...current,...Object.fromEntries(Object.entries(patch).filter(([,value]) => value !== undefined))};
      set({queue:queue.map((item,index) => index === at ? next : item)});
      // A label arriving on the visible reveal keeps it up long enough to read.
      if (at === 0 && changedDetail) {
        const left = handle ? Math.max(0,deadline-Date.now()) : remaining;
        if (left < CPU_REVEAL_DETAIL_MS) arm(CPU_REVEAL_DETAIL_MS,true);
      }
    },
    hold: (held) => {
      if (get().held === held) return;
      set({held});
      if (!get().queue.length) return;
      if (held) { pauseCountdown(); return; }
      if (running()) arm(Math.max(remaining,CPU_REVEAL_RESUME_MS),remaining < CPU_REVEAL_RESUME_MS);
    },
    setHidden: (hidden) => {
      if (get().hidden === hidden) return;
      set({hidden});
      if (!get().queue.length) return;
      if (hidden) { pauseCountdown(); return; }
      if (running()) arm(Math.max(remaining,CPU_REVEAL_RESUME_MS),remaining < CPU_REVEAL_RESUME_MS);
    },
    dismiss: (id) => {
      const {queue} = get();
      const head = queue[0];
      if (!head) return;
      const target = id ?? head.id;
      const at = queue.findIndex(item => item.id === target);
      if (at < 0) return;
      finished.add(target);
      if (finished.size > 200) finished.delete(finished.values().next().value as string);
      set({queue:queue.filter((_,index) => index !== at),...(at === 0 ? {held:false} : {})});
      if (at === 0) showHead();
    },
    reset: () => {
      stop();
      finished.clear();
      remaining = 0;
      set({queue:[],held:false,timer:null});
    },
  };
});

/** True while a CPU reveal is up or waiting: the CPU must not start a new action. */
export const cpuRevealsPending = () => useCpuReveals.getState().queue.length > 0;

/**
 * Milliseconds until the reveal `id` has been visible for `ms`: 0 when it is not queued
 * (or already visible long enough), null while it still waits behind another reveal.
 */
export function cpuRevealReadyIn(id: string, ms: number, now = Date.now()): number | null {
  const {queue,timer} = useCpuReveals.getState();
  const at = queue.findIndex(item => item.id === id);
  if (at < 0) return 0;
  if (at > 0 || !timer) return null;
  return Math.max(0,timer.shownAt+ms-now);
}

/** Name shown for a CPU-owned triggered effect. */
export function cpuTriggerName(kind: string | undefined, counter?: boolean): string {
  switch (kind) {
    case "genesis": return "Genesis";
    case "unitEnd": return "end-of-turn projectile";
    case "auraEnd": return counter ? "duration counter" : "end effect";
    case "fightChoice": return "fight after arrival";
    case "treasureRecover": return "recover treasure";
    case "treasurePlace": return "underwater placement";
    case "drawChoice": return "choose draws";
    case "randomChoice": return "random outcome";
    case "blazeTrail": return "fire trail";
    case "geomancerFill": return "Geomancer ability";
    case "projectileImpact": return "projectile impact";
    default: return "triggered effect";
  }
}

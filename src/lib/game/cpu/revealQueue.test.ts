import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CPU_REVEAL_MAX_QUEUE,
  cpuRevealReadyIn,
  cpuRevealsPending,
  type CpuReveal,
  useCpuReveals,
} from "@/lib/game/cpu/revealQueue";

const card = (name: string) => ({cardId:1,name,type:"Minion",instanceId:name});
const entry = (id: string, overrides: Partial<CpuReveal> = {}): CpuReveal => ({id,seat:"p2",card:card(id),kind:"permanent",action:"summons at Tile #8",...overrides});
const reveals = () => useCpuReveals.getState();
const ids = () => reveals().queue.map(item => item.id);

beforeEach(() => { vi.useFakeTimers(); reveals().reset(); reveals().setHidden(false); });
afterEach(() => { reveals().reset(); vi.useRealTimers(); });

describe("CPU reveal queue timing", () => {
  it("shows one reveal at a time for four seconds each", () => {
    reveals().show(entry("a"));
    reveals().show(entry("b"));
    expect(ids()).toEqual(["a","b"]);
    expect(cpuRevealsPending()).toBe(true);
    vi.advanceTimersByTime(3999);
    expect(ids()).toEqual(["a","b"]);
    const run = reveals().timer?.run;
    vi.advanceTimersByTime(1);
    expect(ids()).toEqual(["b"]);
    expect(reveals().timer?.run).toBe((run || 0)+1);
    expect(reveals().timer?.ms).toBe(4000);
    vi.advanceTimersByTime(4000);
    expect(ids()).toEqual([]);
    expect(reveals().timer).toBeNull();
    expect(cpuRevealsPending()).toBe(false);
  });

  it("holds while hovered and resumes the remaining time on leave", () => {
    reveals().show(entry("a"));
    vi.advanceTimersByTime(2500);
    reveals().hold(true);
    vi.advanceTimersByTime(60000);
    expect(ids()).toEqual(["a"]);
    reveals().hold(false);
    vi.advanceTimersByTime(1499);
    expect(ids()).toEqual(["a"]);
    vi.advanceTimersByTime(1);
    expect(ids()).toEqual([]);
  });

  it("keeps a reveal at least a second after a hover that ends near its deadline", () => {
    reveals().show(entry("a"));
    vi.advanceTimersByTime(3900);
    reveals().hold(true);
    reveals().hold(false);
    vi.advanceTimersByTime(999);
    expect(ids()).toEqual(["a"]);
    vi.advanceTimersByTime(1);
    expect(ids()).toEqual([]);
  });

  it("stops the countdown while the tab is hidden", () => {
    reveals().show(entry("a"));
    vi.advanceTimersByTime(1000);
    reveals().setHidden(true);
    vi.advanceTimersByTime(30000);
    expect(ids()).toEqual(["a"]);
    reveals().setHidden(false);
    vi.advanceTimersByTime(3000);
    expect(ids()).toEqual([]);
  });

  it("updates the same spell in place and keeps a late effect label readable", () => {
    reveals().show(entry("spell",{kind:"spell",action:"casts",detail:null}));
    reveals().show(entry("next"));
    vi.advanceTimersByTime(3000);
    reveals().show(entry("spell",{kind:"spell",action:"casts",detail:"Deal 3 damage to Ogre Goons"}));
    expect(ids()).toEqual(["spell","next"]);
    expect(reveals().queue[0].detail).toBe("Deal 3 damage to Ogre Goons");
    vi.advanceTimersByTime(2499);
    expect(ids()).toEqual(["spell","next"]);
    vi.advanceTimersByTime(1);
    expect(ids()).toEqual(["next"]);
  });

  it("does not extend a reveal whose label arrives early, and ignores updates to unknown or finished ids", () => {
    reveals().show(entry("spell",{kind:"spell",detail:null}));
    vi.advanceTimersByTime(500);
    reveals().update("spell",{detail:"label"});
    reveals().update("missing",{detail:"label"});
    vi.advanceTimersByTime(3500);
    expect(ids()).toEqual([]);
    reveals().update("spell",{detail:"again"});
    reveals().show(entry("spell"));
    expect(ids()).toEqual([]);
  });

  it("dismisses early and moves to the next reveal", () => {
    reveals().show(entry("a"));
    reveals().show(entry("b"));
    reveals().hold(true);
    reveals().dismiss("a");
    expect(ids()).toEqual(["b"]);
    expect(reveals().held).toBe(false);
    vi.advanceTimersByTime(4000);
    expect(ids()).toEqual([]);
  });

  it("reports when a reveal has been visible long enough", () => {
    reveals().show(entry("a"));
    reveals().show(entry("b"));
    expect(cpuRevealReadyIn("b",1500)).toBeNull();
    expect(cpuRevealReadyIn("a",1500)).toBe(1500);
    vi.advanceTimersByTime(1000);
    expect(cpuRevealReadyIn("a",1500)).toBe(500);
    expect(cpuRevealReadyIn("unknown",1500)).toBe(0);
    vi.advanceTimersByTime(3000);
    expect(cpuRevealReadyIn("b",1500)).toBe(1500);
  });

  it("bounds the backlog without dropping the visible reveal", () => {
    for (let i=0;i<CPU_REVEAL_MAX_QUEUE+5;i++) reveals().show(entry(`e${i}`));
    expect(ids()).toHaveLength(CPU_REVEAL_MAX_QUEUE);
    expect(ids()[0]).toBe("e0");
    expect(ids()[CPU_REVEAL_MAX_QUEUE-1]).toBe(`e${CPU_REVEAL_MAX_QUEUE+4}`);
  });
});

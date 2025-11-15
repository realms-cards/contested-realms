import type { GameEvent } from "../types";
import { MAX_EVENTS } from "../types";

export function mergeEvents(prev: GameEvent[], add: GameEvent[]): GameEvent[] {
  const m = new Map<string, GameEvent>();
  for (const e of Array.isArray(prev) ? prev : []) {
    if (!e) continue;
    m.set(`${e.id}|${e.ts}|${e.text}`, e);
  }
  for (const e of Array.isArray(add) ? add : []) {
    if (!e) continue;
    m.set(`${e.id}|${e.ts}|${e.text}`, e);
  }
  const merged = Array.from(m.values()).sort(
    (a, b) => a.ts - b.ts || a.id - b.id
  );
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
}

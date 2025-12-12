import type { GameEvent } from "../types";
import { MAX_EVENTS } from "../types";

export function mergeEvents(prev: GameEvent[], add: GameEvent[]): GameEvent[] {
  const m = new Map<string, GameEvent>();
  // Use event id as primary key - each event has a unique id
  // Events are only created by the acting player, so duplicates shouldn't occur
  for (const e of Array.isArray(prev) ? prev : []) {
    if (!e) continue;
    m.set(`${e.id}`, e);
  }
  for (const e of Array.isArray(add) ? add : []) {
    if (!e) continue;
    // Only add if not already present (by id)
    if (!m.has(`${e.id}`)) {
      m.set(`${e.id}`, e);
    }
  }
  const merged = Array.from(m.values()).sort(
    (a, b) => a.ts - b.ts || a.id - b.id
  );
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
}

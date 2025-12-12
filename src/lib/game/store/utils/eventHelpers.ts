import type { GameEvent } from "../types";
import { MAX_EVENTS } from "../types";

export function mergeEvents(prev: GameEvent[], add: GameEvent[]): GameEvent[] {
  const m = new Map<string, GameEvent>();
  // Use turn|text as the primary dedup key to avoid duplicates from different clients
  // logging the same action with different ids/timestamps
  for (const e of Array.isArray(prev) ? prev : []) {
    if (!e) continue;
    const key = `${e.turn}|${e.text}`;
    // Keep the earliest version (lowest id) of duplicate events
    if (!m.has(key) || e.id < (m.get(key)?.id ?? Infinity)) {
      m.set(key, e);
    }
  }
  for (const e of Array.isArray(add) ? add : []) {
    if (!e) continue;
    const key = `${e.turn}|${e.text}`;
    // Keep the earliest version (lowest id) of duplicate events
    if (!m.has(key) || e.id < (m.get(key)?.id ?? Infinity)) {
      m.set(key, e);
    }
  }
  const merged = Array.from(m.values()).sort(
    (a, b) => a.ts - b.ts || a.id - b.id
  );
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
}

/// <reference lib="webworker" />
// Enumerates the human's legal actions off the main thread: the move generator
// trial-applies every candidate on a cloned state, which can take most of a second.
import type { Action, GameState, PlayerId } from "@sorcery/shared";
import { legalActionsWithCasters, legalGenerationStats } from "@shared/engine/casterActions";
import "@shared/engine/scriptPatches";

export interface LegalRequest {
  id: number;
  state: string; // JSON.stringify(GameState)
  seat: PlayerId;
}

export interface LegalReply {
  id: number;
  actions: Action[];
  error?: string;
}

self.onmessage = (e: MessageEvent<LegalRequest>) => {
  const { id, state, seat } = e.data;
  let reply: LegalReply;
  try {
    reply = { id, actions: legalActionsWithCasters(JSON.parse(state) as GameState, seat) };
    // a truncated list makes actions appear/disappear between renders — say so instead of flapping
    if (legalGenerationStats.dropped) console.warn(`[engine-legal] budget hit, at least ${legalGenerationStats.dropped} candidate(s) skipped`);
  } catch (err) {
    reply = { id, actions: [], error: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(reply);
};

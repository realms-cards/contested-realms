/**
 * The authority for one or more rules-engine matches, running off the Socket.IO event loop.
 *
 * Every engine match's `GameState` lives in here and nowhere else. That is the whole point of
 * the design: the state holds BOTH players' hands and the RNG seed — and the seed yields deck
 * order — so no client may ever hold it. Clients receive `viewFor(state, seat)`, which redacts
 * both.
 *
 * It runs in a worker thread because legal-move generation is expensive: measured over a full
 * game it is ~47ms median but p90 ~785ms and up to ~1.4s on a fast core, because the generator
 * trial-applies every candidate action against a clone of the state. On the main thread that
 * would stall socket traffic for every other match on the instance.
 *
 * The engine is imported by RELATIVE path, never the `@sorcery/shared` alias: tsc does not
 * rewrite path aliases into the CommonJS it emits, so the alias resolves under `server:dev`
 * (tsx) and fails in the production image. See eslint.config.mjs.
 */
import { parentPort } from "node:worker_threads";
import {
  applyAction,
  createGame,
  viewFor,
  effAttack,
  effDefence,
  getCard,
  isDisabled,
} from "../../../vendor/untested-realm/shared/src/index";
import { legalActionsWithCasters } from "../../../shared/engine/casterActions";
// Our fixes to vendored card scripts, applied on import. The authority MUST play by the same
// rules as single player and the bot, or a card behaves differently depending on the mode.
import "../../../shared/engine/scriptPatches";

/* eslint-disable @typescript-eslint/no-explicit-any -- the engine's own types are structural
   and cross a postMessage boundary as plain JSON; the narrow shapes we rely on are asserted
   at the request boundary below. */
type EngineState = any;
type EngineAction = any;

/** Every live match on this worker. Nothing else may reach these objects. */
const matches = new Map<string, EngineState>();

export type EngineRequest =
  | { id: number; kind: "create"; matchId: string; decks: [unknown, unknown]; names: [string, string]; seed: number; first: 0 | 1 }
  | { id: number; kind: "act"; matchId: string; seat: 0 | 1; action: EngineAction }
  | { id: number; kind: "view"; matchId: string; seat: 0 | 1 | null }
  | { id: number; kind: "drop"; matchId: string }
  | { id: number; kind: "snapshot"; matchId: string }
  | { id: number; kind: "restore"; matchId: string; state: unknown };

export type EngineReply =
  | { id: number; ok: true; kind: "create" }
  | { id: number; ok: true; kind: "act"; over: boolean; winner: 0 | 1 | null; draw: boolean }
  | {
      id: number;
      ok: true;
      kind: "view";
      view: unknown;
      power: Record<string, { atk: number; def: number }>;
      disabled: string[];
      legal: unknown[];
    }
  | { id: number; ok: true; kind: "drop" }
  | { id: number; ok: true; kind: "snapshot"; state: unknown }
  | { id: number; ok: true; kind: "restore" }
  | { id: number; ok: false; error: string };

/**
 * Current power and life for every unit whose printed numbers have been changed.
 *
 * Computed HERE because it cannot be computed anywhere else: `effAttack`/`effDefence` consult
 * `grantsPower` scripts that read `state.players`, which `viewFor` reshapes. It therefore
 * travels in the same envelope as the view.
 */
function unitPower(state: EngineState): Record<string, { atk: number; def: number }> {
  const out: Record<string, { atk: number; def: number }> = {};
  for (const unit of Object.values(state.units) as any[]) {
    const printed = getCard(unit.name);
    const atk = effAttack(state, unit);
    const def = effDefence(state, unit);
    if (atk !== (printed?.attack ?? 0) || def !== (printed?.defence ?? printed?.attack ?? 0)) {
      out[unit.id] = { atk, def };
    }
  }
  return out;
}

/**
 * Units the engine considers disabled. Like power, this needs the FULL state: most disabling
 * (Babbling Brook, disabling auras, Iron Shackles, [X]bound minions off their terrain) is DERIVED
 * by `isDisabled` rather than stored on the unit, so a client holding only a view cannot see it.
 * Avatars keep the raw-flag path, as they do in single player.
 */
function disabledUnits(state: EngineState): string[] {
  const out: string[] = [];
  for (const unit of Object.values(state.units) as any[]) {
    if (!unit.isAvatar && isDisabled(state, unit)) out.push(unit.id);
  }
  return out;
}

export function handle(request: EngineRequest): EngineReply {
  try {
    switch (request.kind) {
      case "create": {
        const game = createGame(request.decks as never, request.names, request.seed, request.first as never);
        matches.set(request.matchId, game);
        return { id: request.id, ok: true, kind: "create" };
      }
      case "act": {
        const game = matches.get(request.matchId);
        if (!game) return { id: request.id, ok: false, error: "No such match on this worker." };
        // applyAction mutates in place and offers no rollback, so a card script that throws
        // half way would leave the match corrupt for both players. 38KB clones in well under a
        // millisecond — far cheaper than the alternative.
        const attempt = JSON.parse(JSON.stringify(game));
        const result = applyAction(attempt, request.seat as never, request.action);
        if (!result?.ok) return { id: request.id, ok: false, error: String(result?.error ?? "Rejected.") };
        matches.set(request.matchId, attempt);
        return {
          id: request.id,
          ok: true,
          kind: "act",
          over: attempt.phase === "over",
          winner: attempt.winner ?? null,
          draw: !!attempt.draw,
        };
      }
      case "view": {
        const game = matches.get(request.matchId);
        if (!game) return { id: request.id, ok: false, error: "No such match on this worker." };
        // Legal moves are generated HERE for the same reason the state is: the generator
        // trial-applies every candidate against a full GameState, and a client only ever
        // holds a redacted view, which has no seed and no id counter to apply against.
        // A spectator (seat null) is offered nothing to click.
        const legal =
          request.seat === null ? [] : (legalActionsWithCasters(game, request.seat as never) as unknown[]);
        return {
          id: request.id,
          ok: true,
          kind: "view",
          view: viewFor(game, request.seat as never),
          power: unitPower(game),
          disabled: disabledUnits(game),
          legal,
        };
      }
      case "drop": {
        matches.delete(request.matchId);
        return { id: request.id, ok: true, kind: "drop" };
      }
      case "snapshot": {
        // For surviving a server restart, never for sending to a client: this is the full
        // state, seed and both hands included.
        const game = matches.get(request.matchId);
        if (!game) return { id: request.id, ok: false, error: "No such match on this worker." };
        return { id: request.id, ok: true, kind: "snapshot", state: JSON.parse(JSON.stringify(game)) };
      }
      case "restore": {
        // A state written by a DIFFERENT engine build throws deep inside a card script rather
        // than failing cleanly, so the caller is responsible for checking the build first.
        matches.set(request.matchId, request.state);
        return { id: request.id, ok: true, kind: "restore" };
      }
    }
  } catch (error) {
    // A throwing card script must cost one action, never the worker and never the match.
    return { id: request.id, ok: false, error: String((error as Error)?.message ?? error) };
  }
}

parentPort?.on("message", (request: EngineRequest) => {
  parentPort?.postMessage(handle(request));
});

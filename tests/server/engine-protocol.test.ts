import { describe, expect, it } from "vitest";
import {
  EngineActionSchema,
  EngineRejectSchema,
  EngineViewSchema,
  MatchInfoSchema,
} from "../../src/lib/net/protocol";

/**
 * MatchInfoSchema is a plain z.object with no passthrough, so any field not declared on it is
 * stripped SILENTLY on the way to the client — there is already a live example in the codebase
 * of a field that never arrives for exactly this reason. An engine match that loses its flag
 * in transit would open the LEGACY board over an engine match, so this is worth a test of its
 * own rather than trusting the declaration.
 */
const baseMatch = {
  id: "m1",
  players: [],
  status: "in_progress",
  seed: "123",
};

describe("engineMode survives the match-info schema", () => {
  it("is carried through rather than stripped", () => {
    const parsed = MatchInfoSchema.parse({ ...baseMatch, engineMode: true });
    expect(parsed.engineMode).toBe(true);
  });

  it("is simply absent for an ordinary match", () => {
    expect(MatchInfoSchema.parse(baseMatch).engineMode).toBeUndefined();
  });

  it("proves the hazard is real: an undeclared field IS dropped", () => {
    const parsed = MatchInfoSchema.parse({ ...baseMatch, notDeclaredAnywhere: true }) as Record<string, unknown>;
    expect(parsed.notDeclaredAnywhere, "stripped without complaint").toBeUndefined();
  });
});

describe("the engine wire messages", () => {
  it("accepts an action and keeps the engine's own Action opaque", () => {
    const parsed = EngineActionSchema.parse({ matchId: "m1", action: { t: "keepHand" }, rev: 4 });
    expect(parsed.action).toEqual({ t: "keepHand" });
    // the engine validates its own actions; re-specifying them here would be a second source of truth
    expect(EngineActionSchema.safeParse({ matchId: "m1", action: { t: "anything" } }).success).toBe(true);
  });

  it("requires a matchId, so a message cannot be applied to the wrong game", () => {
    expect(EngineActionSchema.safeParse({ action: { t: "keepHand" } }).success).toBe(false);
  });

  it("carries power AND legal moves with the view, since neither can be derived from one", () => {
    // Both are computed from the full GameState the server holds: power because grantsPower
    // scripts read state.players, and the legal list because generating it trial-applies
    // candidates against a state no client has.
    const parsed = EngineViewSchema.parse({
      matchId: "m1",
      rev: 2,
      seat: 0,
      view: { players: [] },
      power: { u1: { atk: 5, def: 5 } },
      disabled: ["u2"],
      legal: [{ t: "endTurn" }],
    });
    expect(parsed.power.u1).toEqual({ atk: 5, def: 5 });
    // disabling is mostly DERIVED (isDisabled) rather than stored on the unit, so it travels too
    expect(parsed.disabled).toEqual(["u2"]);
    expect(parsed.legal).toHaveLength(1);
  });

  it("will not accept a view envelope with no legal list at all", () => {
    // An empty list means "you may do nothing"; a MISSING one means the server forgot to
    // compute it, and silently rendering an unplayable board would be worse than failing.
    const missing = { matchId: "m1", rev: 1, seat: 0, view: {}, power: {}, disabled: [] };
    expect(EngineViewSchema.safeParse(missing).success).toBe(false);
  });

  it("only allows the two real seats", () => {
    const bad = { matchId: "m1", rev: 1, seat: 2, view: {}, power: {} };
    expect(EngineViewSchema.safeParse(bad).success).toBe(false);
  });

  it("tells a refused client what rev the server is actually on", () => {
    const parsed = EngineRejectSchema.parse({ matchId: "m1", reason: "Not your turn.", rev: 9 });
    expect(parsed.rev).toBe(9);
  });
});

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { handle, type EngineRequest } from "../../server/modules/engine/worker";
import { starterDecks } from "../../vendor/untested-realm/shared/src/index";

/**
 * The server is the authority for a rules-engine PvP match, and these are the properties that
 * justify putting it there rather than in one of the two tabs.
 *
 * The engine's GameState holds BOTH hands and the RNG seed, and the seed yields deck order, so
 * a client that held it would be reading its opponent's hand and draws. Everything below is
 * about that: the state stays here, each seat gets a redacted view, and a rejected action
 * cannot leave the match half-applied.
 */
let next = 0;
/** `Omit` does not distribute over a discriminated union, so widen once at the boundary. */
const call = (req: Record<string, unknown>) => handle({ id: ++next, ...req } as unknown as EngineRequest);

type View = {
  players: { hand: string[] }[];
};

function openMatch(matchId: string) {
  const created = call({
    kind: "create",
    matchId,
    decks: [starterDecks[0], starterDecks[1]] as [unknown, unknown],
    names: ["A", "B"],
    seed: 7,
    first: 0,
  });
  expect(created.ok, "the match was created").toBe(true);
  for (const seat of [0, 1] as const) {
    expect(call({ kind: "act", matchId, seat, action: { t: "keepHand" } }).ok).toBe(true);
  }
}

const viewOf = (matchId: string, seat: 0 | 1) => {
  const reply = call({ kind: "view", matchId, seat });
  if (!reply.ok || reply.kind !== "view") throw new Error("no view");
  return reply.view as View;
};

describe("the server-side engine authority", () => {
  it("never puts the seed or the opponent's hand in a seat's view", () => {
    openMatch("redaction");
    const mine = viewOf("redaction", 0);
    // the seed is what turns a leaked state into knowledge of every future draw
    expect(JSON.stringify(mine)).not.toContain('"seed"');
    expect(mine.players[1].hand.every((card) => card === "hidden"), "their hand is hidden").toBe(true);
    expect(mine.players[0].hand.some((card) => card === "hidden"), "mine is not").toBe(false);
    // and symmetrically for the other seat
    const theirs = viewOf("redaction", 1);
    expect(theirs.players[0].hand.every((card) => card === "hidden")).toBe(true);
  });

  it("leaves the match untouched when it refuses an action", () => {
    openMatch("rollback");
    const before = JSON.stringify(viewOf("rollback", 0));
    // seat 1 acting on seat 0's turn
    const refused = call({ kind: "act", matchId: "rollback", seat: 1, action: { t: "endTurn" } });
    expect(refused.ok, "the engine refused it").toBe(false);
    expect(JSON.stringify(viewOf("rollback", 0)), "and nothing moved").toBe(before);
  });

  it("answers for a match it does not have instead of throwing", () => {
    // a stale client, or an action that reached the wrong worker
    expect(call({ kind: "act", matchId: "ghost", seat: 0, action: { t: "endTurn" } }).ok).toBe(false);
    expect(call({ kind: "view", matchId: "ghost", seat: 0 }).ok).toBe(false);
  });

  it("survives a malformed action rather than taking the worker down with it", () => {
    openMatch("garbage");
    const reply = call({ kind: "act", matchId: "garbage", seat: 0, action: { t: "not-a-real-action" } });
    expect(reply.ok).toBe(false);
    // the match is still usable afterwards
    expect(viewOf("garbage", 0).players).toHaveLength(2);
  });

  it("reports the current power of a unit an effect has changed, with the view", () => {
    openMatch("power");
    const reply = call({ kind: "view", matchId: "power", seat: 0 });
    if (!reply.ok || reply.kind !== "view") throw new Error("no view");
    // nothing is modified at the opening, and the map must travel WITH the view: it cannot be
    // recomputed client-side, because grantsPower scripts read state.players, which viewFor reshapes
    expect(reply.power).toEqual({});
  });

  it("forgets a match when it is dropped", () => {
    openMatch("ephemeral");
    expect(call({ kind: "drop", matchId: "ephemeral" }).ok).toBe(true);
    expect(call({ kind: "view", matchId: "ephemeral", seat: 0 }).ok).toBe(false);
  });
});

describe("the server plays by the same card rules as single player", () => {
  it("imports our script patches wherever it runs the engine", () => {
    // shared/engine/scriptPatches.ts fixes vendored card scripts on import, and must be imported
    // WHEREVER the engine runs. In a player-vs-player match that is the server — so without it,
    // PvP would silently play by the unpatched vendor rules while single player played by ours.
    // (It holds no patches right now, so this checks the wiring, not a patched script.)
    const worker = readFileSync(join(__dirname, "../../server/modules/engine/worker.ts"), "utf8");
    expect(worker).toMatch(/import\s+["'][./]*shared\/engine\/scriptPatches["']/);
  });
});

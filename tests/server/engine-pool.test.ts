import { describe, expect, it } from "vitest";
import { EnginePool, resolveWorkerCount } from "../../server/modules/engine/pool";
import { starterDecks } from "../../vendor/untested-realm/shared/src/index";

/**
 * The pool's job is routing, and the part that MUST be right is pinning: a match's state lives
 * inside exactly one worker, so an action that reaches a different one finds no match and is
 * refused. Under vitest there is no compiled worker beside the pool, so it runs in-process —
 * which is the same `handle` the threads call, so the routing contract is still exercised.
 */
const decks = () => [starterDecks[0], starterDecks[1]] as [unknown, unknown];

describe("sizing the engine pool", () => {
  it("reads ENGINE_WORKERS the same way CPU_BOT_WORKERS is read", () => {
    expect(resolveWorkerCount({ ENGINE_WORKERS: "0" } as NodeJS.ProcessEnv, 8), "0 means in-process").toBe(0);
    expect(resolveWorkerCount({ ENGINE_WORKERS: "off" } as NodeJS.ProcessEnv, 8)).toBe(0);
    expect(resolveWorkerCount({ ENGINE_WORKERS: "2" } as NodeJS.ProcessEnv, 8)).toBe(2);
    // never more threads than cores: extra CPU-bound threads only cost memory and boot time
    expect(resolveWorkerCount({ ENGINE_WORKERS: "99" } as NodeJS.ProcessEnv, 4)).toBe(4);
    expect(resolveWorkerCount({} as NodeJS.ProcessEnv, 8), "default leaves a core for the loop").toBe(4);
    expect(resolveWorkerCount({ ENGINE_WORKERS: "nonsense" } as NodeJS.ProcessEnv, 2)).toBe(1);
  });
});

describe("the engine pool", () => {
  it("runs a match end to end and keeps the seats' views apart", async () => {
    const pool = new EnginePool(0);
    expect(pool.inProcess, "no compiled worker under vitest").toBe(true);
    expect((await pool.create("m", decks(), ["A", "B"], 7, 0)).ok).toBe(true);
    for (const seat of [0, 1] as const) {
      expect((await pool.act("m", seat, { t: "keepHand" })).ok).toBe(true);
    }
    const mine = await pool.view("m", 0);
    if (!mine.ok || mine.kind !== "view") throw new Error("no view");
    const view = mine.view as { players: { hand: string[] }[] };
    expect(view.players[1].hand.every((c) => c === "hidden")).toBe(true);
    expect(JSON.stringify(view)).not.toContain('"seed"');
    pool.shutdown();
  });

  it("keeps two matches from seeing each other", async () => {
    const pool = new EnginePool(0);
    await pool.create("a", decks(), ["A", "B"], 1, 0);
    await pool.create("b", decks(), ["C", "D"], 2, 1);
    // a different seed and a different starting player: the two must not be the same game
    const a = await pool.view("a", 0);
    const b = await pool.view("b", 0);
    if (!a.ok || a.kind !== "view" || !b.ok || b.kind !== "view") throw new Error("no view");
    expect(JSON.stringify(a.view)).not.toBe(JSON.stringify(b.view));
    pool.shutdown();
  });

  it("forgets a match on drop, so a stale action cannot resurrect it", async () => {
    const pool = new EnginePool(0);
    await pool.create("gone", decks(), ["A", "B"], 3, 0);
    expect((await pool.drop("gone")).ok).toBe(true);
    expect((await pool.act("gone", 0, { t: "keepHand" })).ok, "refused, not recreated").toBe(false);
    pool.shutdown();
  });

  it("refuses an action for a match it never had", async () => {
    const pool = new EnginePool(0);
    expect((await pool.act("never", 0, { t: "keepHand" })).ok).toBe(false);
    pool.shutdown();
  });
});

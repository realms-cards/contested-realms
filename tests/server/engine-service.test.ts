import { describe, expect, it } from "vitest";
import { EnginePool } from "../../server/modules/engine/pool";
import { EngineMatchService } from "../../server/modules/engine/service";
import { starterDecks } from "../../vendor/untested-realm/shared/src/index";

const decks = () => [starterDecks[0], starterDecks[1]] as [unknown, unknown];
/** 0 workers keeps the engine in-process, which is what vitest can reach. */
const service = () => new EngineMatchService(new EnginePool(0));

async function opened(id = "m") {
  const s = service();
  expect((await s.start(id, decks(), ["A", "B"], 7, 0)).ok).toBe(true);
  return s;
}

describe("the engine match service", () => {
  it("only answers for matches it actually started", async () => {
    const s = service();
    expect(s.isEngineMatch("m")).toBe(false);
    // this is what keeps the legacy action handler away from an engine match
    await s.start("m", decks(), ["A", "B"], 7, 0);
    expect(s.isEngineMatch("m")).toBe(true);
    expect(s.isEngineMatch("other")).toBe(false);
    s.shutdown();
  });

  it("advances the revision once per APPLIED action, never on a refusal", async () => {
    const s = await opened();
    expect(s.revOf("m")).toBe(0);
    expect((await s.act("m", 0, { t: "keepHand" })).ok).toBe(true);
    expect(s.revOf("m")).toBe(1);
    const refused = await s.act("m", 0, { t: "not-an-action" });
    expect(refused.ok).toBe(false);
    expect(s.revOf("m"), "a refusal is not a move").toBe(1);
    s.shutdown();
  });

  it("refuses an action decided on a stale board, and says what the real rev is", async () => {
    const s = await opened();
    await s.act("m", 0, { t: "keepHand" });
    const stale = await s.act("m", 1, { t: "keepHand" }, 0);
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("unreachable");
    expect(stale.rev, "so the client can catch up instead of guessing").toBe(1);
    // the same action with the right rev is fine
    expect((await s.act("m", 1, { t: "keepHand" }, 1)).ok).toBe(true);
    s.shutdown();
  });

  it("hands each seat only its own view", async () => {
    const s = await opened();
    for (const seat of [0, 1] as const) await s.act("m", seat, { t: "keepHand" });
    const mine = await s.viewFor("m", 0);
    expect(mine).not.toBeNull();
    expect(mine?.seat).toBe(0);
    expect(JSON.stringify(mine?.view)).not.toContain('"seed"');
    expect(await s.viewFor("missing", 0), "and nothing for a match it has no part in").toBeNull();
    s.shutdown();
  });

  it("tells a seat what it may legally do, because the client cannot work it out", async () => {
    const s = await opened("legal");
    for (const seat of [0, 1] as const) await s.act("legal", seat, { t: "keepHand" });
    const active = await s.viewFor("legal", 0);
    expect(Array.isArray(active?.legal)).toBe(true);
    // the player to act has real choices; the generator is the human-grade one from shared/,
    // not the engine's narrower bot list
    expect(active!.legal.length, "the active seat has moves").toBeGreaterThan(0);
    const waiting = await s.viewFor("legal", 1);
    expect(waiting!.legal.length, "the seat not to act has none").toBe(0);
    s.shutdown();
  });

  it("survives a restart: snapshot, restore, and the revision is kept", async () => {
    const before = await opened("restarting");
    await before.act("restarting", 0, { t: "keepHand" });
    const saved = await before.snapshot("restarting");
    expect(saved, "the full state, which never leaves the server").toBeTruthy();
    const rev = before.revOf("restarting");
    before.shutdown();

    const after = service();
    expect(await after.restore("restarting", saved, rev, false)).toBe(true);
    expect(after.revOf("restarting"), "a client on the old rev is still told to refresh").toBe(rev);
    const view = await after.viewFor("restarting", 1);
    expect(view?.rev).toBe(rev);
    after.shutdown();
  });

  it("stops accepting actions once the game is over", async () => {
    const s = await opened("finished");
    for (const seat of [0, 1] as const) await s.act("finished", seat, { t: "keepHand" });
    expect((await s.act("finished", 0, { t: "concede" })).over).toBe(true);
    const late = await s.act("finished", 1, { t: "endTurn" });
    expect(late.ok).toBe(false);
    if (late.ok) throw new Error("unreachable");
    expect(late.reason).toContain("over");
    s.shutdown();
  });

  it("forgets a match when it ends", async () => {
    const s = await opened("ending");
    await s.end("ending");
    expect(s.isEngineMatch("ending")).toBe(false);
    expect(await s.viewFor("ending", 0)).toBeNull();
    s.shutdown();
  });
});

describe("turning a submitted deck into an engine deck", () => {
  it("refuses a deck with a card the engine has never heard of", async () => {
    const { submittedDeckToEngine } = await import("../../shared/engine/decks");
    const result = submittedDeckToEngine(
      [
        { name: "Avatar of Fire", type: "Avatar", zone: "avatar" },
        { name: "Not A Real Card", type: "Minion", zone: "spellbook" },
      ],
      "Mystery",
    );
    // better to refuse at the door than to surface an uncastable card mid-match
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("Not A Real Card");
  });

  it("refuses a deck with no avatar, and an empty one", async () => {
    const { submittedDeckToEngine } = await import("../../shared/engine/decks");
    expect(submittedDeckToEngine([{ name: "Rustic Village", type: "Site", zone: "atlas" }], "x").ok).toBe(false);
    expect(submittedDeckToEngine([], "x").ok).toBe(false);
  });

  it("splits sites into the atlas and everything else into the spellbook", async () => {
    const { submittedDeckToEngine } = await import("../../shared/engine/decks");
    const result = submittedDeckToEngine(
      [
        { name: "Avatar of Fire", type: "Avatar", zone: "avatar" },
        { name: "Rustic Village", type: "Site", zone: "atlas" },
        { name: "Rustic Village", type: "Site", zone: "atlas" },
        { name: "Chain Lightning", type: "Magic", zone: "spellbook" },
      ],
      "Burn",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.deck.avatar).toBe("Avatar of Fire");
    expect(result.deck.atlas["Rustic Village"], "duplicates are counted, not repeated").toBe(2);
    expect(result.deck.spellbook["Chain Lightning"]).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { EnginePool } from "../../server/modules/engine/pool";
import { EngineMatchService } from "../../server/modules/engine/service";
import { useEngineSession } from "../../src/lib/engine-mode/session";
import { starterDecks } from "../../vendor/untested-realm/shared/src/index";
import type { Action, PlayerId, PlayerView } from "../../vendor/untested-realm/shared/src/index";

/**
 * The two halves, joined: a real server-side authority driving a real client session over the
 * same envelopes the socket would carry. Everything in between is exercised — the worker's
 * redaction, the service's revisions, the wire shape, and the client's refusal to invent a
 * board of its own.
 */
describe("a rules-engine match, server to client", () => {
  it("plays a turn with neither client ever holding the game", async () => {
    const service = new EngineMatchService(new EnginePool(0));
    await service.start("m", [starterDecks[0], starterDecks[1]] as [unknown, unknown], ["A", "B"], 7, 0);

    // one client, seat 0; everything it learns arrives through this
    const sent: { type: string; action?: unknown; rev?: number }[] = [];
    useEngineSession.setState({ mode: "local", seat: 0 as PlayerId, game: null, rev: 0, matchId: "" });
    useEngineSession.getState().joinRemote("m", 0 as PlayerId, (m) => sent.push(m as { type: string }));

    const pump = async (seat: PlayerId) => {
      const envelope = await service.viewFor("m", seat as 0 | 1);
      if (!envelope) throw new Error("no envelope");
      useEngineSession.getState().applyRemoteView({
        matchId: envelope.matchId,
        rev: envelope.rev,
        seat: envelope.seat as PlayerId,
        view: envelope.view as PlayerView,
        power: envelope.power,
        disabled: envelope.disabled,
        legal: envelope.legal as Action[],
        over: envelope.over,
        // the server's own id, so this also checks a client and server built together agree
        build: envelope.build,
      });
      return envelope;
    };

    const opening = await pump(0 as PlayerId);
    expect(useEngineSession.getState().game, "the view became the board").not.toBeNull();
    expect(JSON.stringify(opening.view), "and it carries no seed").not.toContain('"seed"');

    // the client asks to keep its hand; nothing happens locally
    const revBefore = useEngineSession.getState().rev;
    useEngineSession.getState().dispatch({ t: "keepHand" } as Action);
    expect(sent.at(-1)).toMatchObject({ type: "engine:action", action: { t: "keepHand" } });
    expect(useEngineSession.getState().rev, "the board does not move until the server says so").toBe(revBefore);

    // the server applies it and the next view arrives
    const outcome = await service.act("m", 0, { t: "keepHand" });
    expect(outcome.ok).toBe(true);
    const after = await pump(0 as PlayerId);
    expect(after.rev).toBeGreaterThan(opening.rev);
    expect(useEngineSession.getState().rev).toBe(after.rev);

    service.shutdown();
  });

  it("refuses an action aimed at the wrong seat, and the client is told", async () => {
    const service = new EngineMatchService(new EnginePool(0));
    await service.start("m2", [starterDecks[0], starterDecks[1]] as [unknown, unknown], ["A", "B"], 7, 0);
    for (const seat of [0, 1] as const) await service.act("m2", seat, { t: "keepHand" });

    useEngineSession.setState({ mode: "local", seat: 0 as PlayerId, game: null, rev: 0, matchId: "" });
    useEngineSession.getState().joinRemote("m2", 1 as PlayerId, () => undefined);

    // seat 1 trying to act on seat 0's turn
    const refused = await service.act("m2", 1, { t: "endTurn" });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    useEngineSession.getState().applyRemoteReject(refused.reason);
    expect(useEngineSession.getState().lastError).toBe(refused.reason);
    service.shutdown();
  });

  it("gives the two seats genuinely different boards", async () => {
    const service = new EngineMatchService(new EnginePool(0));
    await service.start("m3", [starterDecks[0], starterDecks[1]] as [unknown, unknown], ["A", "B"], 7, 0);
    const a = await service.viewFor("m3", 0);
    const b = await service.viewFor("m3", 1);
    type Hands = { players: { hand: string[] }[] };
    const mine = (a!.view as Hands).players[0].hand;
    const theirsOfMine = (b!.view as Hands).players[0].hand;
    expect(mine.some((c) => c === "hidden"), "I see my own hand").toBe(false);
    expect(theirsOfMine.every((c) => c === "hidden"), "they do not").toBe(true);
    service.shutdown();
  });
});

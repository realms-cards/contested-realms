import { applyAction, createGame, findCard } from "@sorcery/shared";
import type { PlayerId } from "@sorcery/shared";
import { botAction, botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { localizeEngineText } from "@/lib/engine-mode/coords";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import type { GameEvent } from "@/lib/game/store/types";
import { buildActionFeed, entryCells, entrySummary, latestEntry, pilotedText, tileCell } from "./actionFeed";
import type { FeedContext } from "./actionFeed";

const ctx: FeedContext = {
  players: ["You", "Computer"],
  cardType: (name) => findCard(name)?.type ?? null,
  locate: (name) => (name === "Foot Soldier" ? ["4,1"] : name === "Spectral Stalker" ? ["2,1"] : []),
};

/** Log lines as the projection hands them over: `turn|seat(0/1/-)|localized text`. */
function events(lines: string[]): GameEvent[] {
  return lines.map((line, id) => {
    const [turn, seat, text] = line.split("|");
    return { id, ts: 0, turn: Number(turn), player: seat === "0" ? 1 : seat === "1" ? 2 : undefined, text };
  });
}

describe("buildActionFeed", () => {
  it("groups per turn, newest first, and names the turn's seat", () => {
    const feed = buildActionFeed(
      events([
        "1|0|— Turn 1: You —",
        "1|0|You play Vantage Hills at tile 18.",
        "2|1|— Turn 2: Computer —",
        "2|1|Computer draws a card from their spellbook.",
        "2|1|Computer plays Dark Tower at tile 3.",
      ]),
      ctx,
    );
    expect(feed.map((t) => [t.turn, t.seat])).toEqual([
      [2, "p2"],
      [1, "p1"],
    ]);
    const [draw, play] = [feed[0].entries[1], feed[0].entries[0]];
    expect(play).toMatchObject({ kind: "play", seat: "p2", card: "Dark Tower", cells: ["2,0"], text: "Computer plays Dark Tower at tile 3." });
    // the engine says "their spellbook"; the feed says what was drawn
    expect(draw).toMatchObject({ kind: "draw", text: "Computer draws a spell." });
    expect(feed[1].entries[0].text).toBe("You play Vantage Hills at tile 18.");
  });

  it("folds damage and deaths into the action that caused them", () => {
    const feed = buildActionFeed(
      events([
        "8|1|— Turn 8: Computer —",
        "8|1|Computer casts Lightning Bolt.",
        "8|1|Foot Soldier takes 3 damage.",
        "8|-|Foot Soldier dies. (killed by Sparkmage)",
      ]),
      ctx,
    );
    const [bolt] = feed[0].entries;
    expect(bolt.kind).toBe("cast");
    expect(bolt.card).toBe("Lightning Bolt");
    expect(bolt.outcomes.map((o) => [o.kind, o.text])).toEqual([
      ["damage", "Foot Soldier takes 3 damage."],
      ["death", "Foot Soldier dies (killed by Sparkmage)."],
    ]);
    // tapping it lights where the damage landed
    expect(entryCells(bolt)).toEqual(["4,1"]);
    expect(entrySummary(bolt)).toBe("Computer casts Lightning Bolt — Foot Soldier takes 3 damage, Foot Soldier dies (killed by Sparkmage).");
  });

  it("reads a minion cast as a summon, in the reader's person", () => {
    const feed = buildActionFeed(events(["2|1|Computer casts Spectral Stalker.", "3|0|You cast Wild Boars."]), ctx);
    expect(feed[1].entries[0]).toMatchObject({ kind: "summon", text: "Computer summons Spectral Stalker.", cells: ["2,1"] });
    expect(feed[0].entries[0]).toMatchObject({ kind: "summon", text: "You summon Wild Boars." });
  });

  it("merges a move and the attack it makes, with the life lost underneath", () => {
    const feed = buildActionFeed(
      events([
        "6|1|Dead of Night Demon moves to tile 13.",
        "6|1|Dead of Night Demon attacks Bedrock!",
        "6|0|You los 2 life (now 18).",
        "6|1|Bedrock is struck for 2.",
      ]),
      ctx,
    );
    const [attack] = feed[0].entries;
    expect(attack.kind).toBe("attack");
    expect(attack.text).toBe("Dead of Night Demon moves to tile 13 and attacks Bedrock.");
    expect(attack.cells).toContain("2,2");
    // the engine's "You los" is read for what it means
    expect(attack.outcomes.map((o) => o.text)).toEqual(["You lose 2 life (now 18).", "Bedrock takes 2 damage."]);
  });

  it("names a summon's tile and a move's origin from where the cards stood when the line arrived", () => {
    const where: Record<string, { before: string[]; now: string[] }> = {
      // a second Stalker already on tile 9: only the new square is the summon's
      "0\u0000Spectral Stalker": { before: ["3,1"], now: ["3,1", "2,0"] },
      "1\u0000Spectral Stalker": { before: ["2,0", "3,1"], now: ["2,1", "3,1"] },
      "2\u0000Gyre Hippogriffs": { before: ["1,0"], now: ["1,2"] },
    };
    const pinned: FeedContext = {
      ...ctx,
      placedAt: (id, name) => where[`${id}\u0000${name}`] ?? null,
    };
    const feed = buildActionFeed(
      events([
        "3|1|Computer casts Spectral Stalker.",
        "3|1|Spectral Stalker moves to tile 8.",
        "3|1|Gyre Hippogriffs moves to tile 12.",
        "3|1|Gyre Hippogriffs attacks Wayfaring Pilgrim!",
      ]),
      pinned,
    );
    const [attack, move, summon] = feed[0].entries;
    expect(summon).toMatchObject({ kind: "summon", text: "Computer summons Spectral Stalker at tile 3.", cells: ["2,0"] });
    // two Stalkers stood somewhere before: the origin is ambiguous, so none is claimed
    expect(move.text).toBe("Spectral Stalker moves to tile 8.");
    expect(attack.text).toBe("Gyre Hippogriffs moves from tile 2 to tile 12 and attacks Wayfaring Pilgrim.");
    expect(attack.cells).toEqual(expect.arrayContaining(["1,0", "1,2"]));
  });

  it("treats a card's colon line as an ability and drops bookkeeping and emoji", () => {
    const feed = buildActionFeed(
      events([
        "10|1|Nimbus Jinn: Discard a spell → Deal 3 damage to another random unit here.",
        "10|1|Computer discards Roaming Monster.",
        "10|1|Dark Tower provides 1 mana.",
        "11|1|⏱ Computer runs out of time — You wins.",
      ]),
      ctx,
    );
    const jinn = feed[1].entries[0];
    expect(jinn).toMatchObject({ kind: "ability", card: "Nimbus Jinn" });
    expect(jinn.outcomes.map((o) => o.text)).toEqual(["Computer discards Roaming Monster."]);
    expect(feed[0].entries[0].text.startsWith("Computer runs out")).toBe(true);
  });

  it("finds the opponent's latest card action for the inspector's quiet state", () => {
    const feed = buildActionFeed(
      events(["4|1|Computer plays Dark Tower at tile 8.", "4|1|Computer draws a card from their atlas.", "5|0|You cast Wild Boars."]),
      ctx,
    );
    expect(latestEntry(feed, "p2", true)?.card).toBe("Dark Tower");
    expect(latestEntry(feed, "p1")?.card).toBe("Wild Boars");
  });

  it("tile numbers map to our cell keys", () => {
    expect(tileCell(1)).toBe("0,0");
    expect(tileCell(18)).toBe("2,3");
    expect(tileCell(20)).toBe("4,3");
    expect(tileCell(0)).toBeNull();
    expect(tileCell(21)).toBeNull();
  });

  it("reads a whole bot game: every play names its tile and nothing is lost", () => {
    const g = createGame([toEngineDeck(enginePrecons[1]), toEngineDeck(enginePrecons[2])], ["You", "Computer"], 3, 0 as PlayerId);
    for (let i = 0; i < 160 && g.phase !== "over"; i++) {
      const s: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null;
      if (s === null) break;
      if (!applyAction(g, s, botAction(g, s)).ok)
        applyAction(g, s, g.prompts[0] ? { t: "prompt", promptId: g.prompts[0].id, choice: null } : { t: "endTurn" });
    }
    const evs: GameEvent[] = g.log.map((l, id) => ({
      id,
      ts: 0,
      turn: l.turn,
      player: l.player === null || l.player === undefined ? undefined : l.player === 0 ? 1 : 2,
      text: localizeEngineText(l.msg),
    }));
    const feed = buildActionFeed(evs, ctx);
    expect(feed.length).toBeGreaterThan(3);
    const entries = feed.flatMap((t) => t.entries);
    const plays = entries.filter((e) => e.kind === "play");
    expect(plays.length).toBeGreaterThan(2);
    for (const play of plays) expect(play.cells).toHaveLength(1);
    // every entry is a sentence without emoji
    for (const e of entries) {
      expect(e.text.length).toBeGreaterThan(3);
      expect(/\p{Extended_Pictographic}/u.test(e.text)).toBe(false);
    }
    // turns run newest first
    const order = feed.map((t) => t.turn);
    expect([...order].sort((a, b) => b - a)).toEqual(order);
  }, 120000);
});

describe("session notes and piloted turns", () => {
  it("gives a recorded toll its own entry with the discarded card, folding the line it explains", () => {
    const feed = buildActionFeed(
      events([
        "5|0|— Turn 5: You —",
        "5|0|River Rapids: Push a minion along the Rivers.",
        "5|1|Wild Boars pays the troll's toll.",
      ]),
      {
        ...ctx,
        notes: [
          {
            lines: [2],
            after: 1,
            seat: "p2",
            kind: "discard",
            text: "Computer pays the Troll Bridge toll: discards Lightning Bolt.",
            card: "Lightning Bolt",
            cells: ["2,2"],
          },
        ],
      },
    );
    const [toll, push] = feed[0].entries;
    expect(toll).toMatchObject({ id: 2, kind: "discard", seat: "p2", card: "Lightning Bolt", cells: ["2,2"], outcomes: [] });
    expect(toll.text).toBe("Computer pays the Troll Bridge toll: discards Lightning Bolt.");
    // the push no longer carries the bare engine line underneath
    expect(push.kind).toBe("ability");
    expect(push.outcomes).toEqual([]);
    expect(latestEntry(feed, "p2", true)).toBe(toll);
  });

  it("places a note whose answer logged nothing right after the line before it", () => {
    const feed = buildActionFeed(events(["5|0|— Turn 5: You —", "5|0|You cast Lightning Bolt."]), {
      ...ctx,
      notes: [{ lines: [], after: 1, seat: "p2", kind: "discard", text: "Computer discards Foot Soldier.", card: "Foot Soldier", cells: [] }],
    });
    expect(feed[0].entries.map((e) => e.text)).toEqual(["Computer discards Foot Soldier.", "You cast Lightning Bolt."]);
  });

  it("marks a turn played by the other seat (Courtesan Thaïs)", () => {
    const feed = buildActionFeed(
      events(["4|1|— Turn 4: Computer —", "4|1|Computer draws a card from their spellbook.", "5|0|— Turn 5: You —", "5|0|You draws a card from your spellbook."]),
      { ...ctx, controlTurns: { 5: 0 } },
    );
    expect(feed.map((t) => [t.turn, t.playedBy])).toEqual([
      [5, "p2"],
      [4, null],
    ]);
  });

  it("credits the right seat when this client plays engine seat 1", () => {
    // Online, seat 1 sees itself as p1. Its own turn (engine seat 1) piloted by the opponent
    // was decided by p2; the opponent's turn (engine seat 0) piloted by us, by p1.
    const feed = buildActionFeed(
      events(["4|1|— Turn 4: Them —", "4|1|Them draws a card.", "5|0|— Turn 5: You —", "5|0|You draws a card."]),
      { ...ctx, viewer: 1, controlTurns: { 4: 1, 5: 0 } },
    );
    expect(feed.map((t) => [t.turn, t.playedBy])).toEqual([
      [5, "p1"],
      [4, "p2"],
    ]);
  });
});

describe("a turn played by the other seat (Courtesan Thaïs)", () => {
  const entry = (seat: "p1" | "p2", kind: "move" | "attack" | "summon" | "cast" | "ability", text: string, card: string) => ({ seat, kind, text, card });
  it("tells the computer's moves of our pieces in the second person", () => {
    expect(pilotedText(entry("p1", "move", "Flamecaller moves from tile 18 to tile 13.", "Flamecaller"), "p2", "Computer")).toBe(
      "Computer moves your Flamecaller from tile 18 to tile 13.",
    );
    expect(pilotedText(entry("p1", "summon", "You summon Pit Vipers at tile 13.", "Pit Vipers"), "p2", "Computer")).toBe(
      "Computer summons Pit Vipers at tile 13 for you.",
    );
    expect(pilotedText(entry("p1", "attack", "Pit Vipers attacks Wild Boars.", "Pit Vipers"), "p2", "Computer")).toBe(
      "Computer attacks Wild Boars with your Pit Vipers.",
    );
  });
  it("tells our moves of their pieces as ours, for them", () => {
    expect(pilotedText(entry("p2", "cast", "Computer casts Lightning Bolt.", "Lightning Bolt"), "p1", "Computer")).toBe(
      "You cast Lightning Bolt for Computer.",
    );
    expect(pilotedText(entry("p2", "move", "Wild Boars moves to tile 8.", "Wild Boars"), "p1", "Computer")).toBe(
      "You move Computer's Wild Boars to tile 8.",
    );
  });
  it("leaves the deciding seat's own pieces alone", () => {
    expect(pilotedText(entry("p2", "move", "Wild Boars moves to tile 8.", "Wild Boars"), "p2", "Computer")).toBe("Wild Boars moves to tile 8.");
  });
});

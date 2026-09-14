import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractMagicTargetingHintsSync,
  isSpellcasterCard,
  isSpellcasterGrantingArtifact,
  isSpellcasterGrantingSite,
} from "@/lib/game/cardAbilities";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, CellKey, GameState } from "@/lib/game/store";
import {
  buildProjectileTarget,
  getMagicOrigin,
  isMagicCasterCandidate,
  isTileInMagicRange,
  projectileDirection,
} from "@/lib/game/store/utils/magicTargeting";
import type { CustomMessage, GameTransport } from "@/lib/net/transport";

/**
 * The combat / magic guide flows only work when BOTH seats have opted in and
 * every message step reaches the other client exactly once. These tests cover
 * the preference handshake (join order, reloads, CPU bot) and the echo
 * suppression that keeps the sender from re-applying its own broadcast.
 */

type Sent = Array<Record<string, unknown>>;

// jsdom has no media playback; life changes play a sound.
beforeAll(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() =>
    Promise.resolve(),
  );
});

function recordingTransport(sent: Sent): GameTransport {
  return {
    connect: async () => {},
    disconnect: () => {},
    joinMatch: async () => {},
    leaveMatch: () => {},
    ready: () => {},
    startMatch: () => {},
    sendAction: () => {},
    sendMessage: (msg: CustomMessage) => {
      sent.push(msg as unknown as Record<string, unknown>);
    },
    mulliganDone: () => {},
    sendChat: () => {},
    resync: () => {},
    on: () => () => {},
  } as unknown as GameTransport;
}

const spellCard: CardRef = {
  cardId: 9001,
  name: "Chain Lightning",
  type: "Magic",
  text: "Deal 2 damage to target unit nearby.",
  instanceId: "inst_spell",
  owner: "p1",
};

describe("guide preference handshake", () => {
  let store: ReturnType<typeof createGameStore>;
  let sent: Sent;

  beforeEach(() => {
    store = createGameStore();
    sent = [];
    store.setState({
      transport: recordingTransport(sent),
      localPlayerId: "me",
      opponentPlayerId: "them",
      interactionGuides: true,
      magicGuides: true,
    } as Partial<GameState>);
  });

  it("announces prefs once a seat is assigned and stays inactive until the opponent opts in", () => {
    store.getState().setActorKey("p1");
    const announce = sent.filter((m) => m.type === "guidePref");
    expect(announce).toHaveLength(1);
    expect(announce[0]).toMatchObject({
      seat: "p1",
      combatGuides: true,
      magicGuides: true,
      reply: false,
    });
    expect(store.getState().combatGuidesActive).toBe(false);
    expect(store.getState().magicGuidesActive).toBe(false);
  });

  it("answers an opponent announcement with its own prefs, but never answers a reply", () => {
    store.getState().setActorKey("p1");
    sent.length = 0;

    store.getState().receiveCustomMessage({
      type: "guidePref",
      seat: "p2",
      combatGuides: true,
      magicGuides: true,
    } as unknown as CustomMessage);
    expect(store.getState().combatGuidesActive).toBe(true);
    expect(store.getState().magicGuidesActive).toBe(true);
    const replies = sent.filter((m) => m.type === "guidePref");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ seat: "p1", reply: true });

    sent.length = 0;
    store.getState().receiveCustomMessage({
      type: "guidePref",
      seat: "p2",
      combatGuides: true,
      magicGuides: false,
      reply: true,
    } as unknown as CustomMessage);
    expect(sent.filter((m) => m.type === "guidePref")).toHaveLength(0);
    expect(store.getState().magicGuidesActive).toBe(false);
    expect(store.getState().combatGuidesActive).toBe(true);
  });

  it("does not wipe the opponent's known prefs when the seat is re-assigned unchanged", () => {
    store.getState().setActorKey("p1");
    store.getState().receiveCustomMessage({
      type: "guidePref",
      seat: "p2",
      combatGuides: true,
      magicGuides: true,
      reply: true,
    } as unknown as CustomMessage);
    expect(store.getState().combatGuidesActive).toBe(true);
    sent.length = 0;
    store.getState().setActorKey("p1");
    expect(store.getState().combatGuidesActive).toBe(true);
    expect(sent.filter((m) => m.type === "guidePref")).toHaveLength(0);
  });

  it("deactivates the guided flows when the seat is released", () => {
    store.getState().setActorKey("p1");
    store.getState().receiveCustomMessage({
      type: "guidePref",
      seat: "p2",
      combatGuides: true,
      magicGuides: true,
      reply: true,
    } as unknown as CustomMessage);
    store.getState().setActorKey(null);
    expect(store.getState().combatGuidesActive).toBe(false);
    expect(store.getState().magicGuidesActive).toBe(false);
  });

  it("keeps the local toggle a preference only while offline / hotseat", () => {
    store.setState({ transport: null } as Partial<GameState>);
    store.getState().setInteractionGuides(true);
    store.getState().setMagicGuides(true);
    expect(store.getState().interactionGuides).toBe(true);
    expect(store.getState().combatGuidesActive).toBe(false);
    expect(store.getState().magicGuidesActive).toBe(false);
  });

  it("keeps both guides on against a CPU opponent, whatever either seat prefers", () => {
    store.setState({
      opponentPlayerId: "cpu_bot",
      interactionGuides: false,
      magicGuides: false,
    } as Partial<GameState>);
    store.getState().setActorKey("p1");
    expect(store.getState().combatGuidesActive).toBe(true);
    expect(store.getState().magicGuidesActive).toBe(true);
    store.getState().receiveCustomMessage({
      type: "guidePref",
      seat: "p2",
      combatGuides: false,
      magicGuides: false,
      reply: true,
    } as unknown as CustomMessage);
    store.getState().setInteractionGuides(false);
    store.getState().setMagicGuides(false);
    expect(store.getState().combatGuidesActive).toBe(true);
    expect(store.getState().magicGuidesActive).toBe(true);
    // A rematch reset keeps the seat, so setActorKey never re-runs.
    store.getState().resetGameState();
    expect(store.getState().combatGuidesActive).toBe(true);
    store.getState().setOpponentPlayerId("them");
    expect(store.getState().combatGuidesActive).toBe(false);
    expect(store.getState().magicGuidesActive).toBe(false);
  });
});

describe("guide flow echo suppression", () => {
  let store: ReturnType<typeof createGameStore>;
  let sent: Sent;

  beforeEach(() => {
    store = createGameStore();
    sent = [];
    store.setState({
      transport: recordingTransport(sent),
      localPlayerId: "me",
      opponentPlayerId: "them",
      actorKey: "p1",
      currentPlayer: 1,
      interactionGuides: true,
      magicGuides: true,
      combatGuideSeatPrefs: { p1: true, p2: true },
      magicGuideSeatPrefs: { p1: true, p2: true },
      combatGuidesActive: true,
      magicGuidesActive: true,
    } as Partial<GameState>);
  });

  it("ignores the caster's own magicBegin echo so the preset caster survives", () => {
    const at = "2,3" as CellKey;
    store.setState({
      permanents: { [at]: [{ owner: 1, card: spellCard, instanceId: "inst_spell" }] },
    } as unknown as Partial<GameState>);
    store.getState().beginMagicCast({
      tile: { x: 2, y: 3 },
      spell: { at, index: 0, instanceId: "inst_spell", owner: 1, card: spellCard },
    });
    // The player chooses who casts; nothing is preselected.
    expect(store.getState().pendingMagic?.status).toBe("choosingCaster");
    expect(store.getState().pendingMagic?.caster).toBeNull();
    store.getState().setMagicCasterChoice({ kind: "avatar", seat: "p1" });
    const pending = store.getState().pendingMagic;
    expect(pending?.status).toBe("choosingTarget");
    expect(pending?.caster).toEqual({ kind: "avatar", seat: "p1" });
    expect(pending?.hints?.mode).toBe("single");
    expect(pending?.hints?.range).toBe("nearby");

    const begin = sent.find((m) => m.type === "magicBegin");
    expect(begin).toBeTruthy();
    store.getState().receiveCustomMessage({
      ...begin,
      playerKey: "p1",
    } as unknown as CustomMessage);
    expect(store.getState().pendingMagic?.status).toBe("choosingTarget");
    expect(store.getState().pendingMagic?.caster).toEqual({
      kind: "avatar",
      seat: "p1",
    });
  });

  it("does not re-apply its own combatLifeDamage echo", () => {
    store.setState({
      players: {
        ...store.getState().players,
        p1: { ...store.getState().players.p1, life: 20, lifeState: "alive" },
      },
    } as Partial<GameState>);
    store.getState().receiveCustomMessage({
      type: "combatLifeDamage",
      id: "cmb_1",
      damage: [{ seat: "p1", amount: 3 }],
      playerKey: "p1",
    } as unknown as CustomMessage);
    expect(store.getState().players.p1.life).toBe(20);

    store.getState().receiveCustomMessage({
      type: "combatLifeDamage",
      id: "cmb_1",
      damage: [{ seat: "p1", amount: 3 }],
      playerKey: "p2",
    } as unknown as CustomMessage);
    expect(store.getState().players.p1.life).toBe(17);
  });

  it("applies magicDamage to the CPU opponent's units from the human client", () => {
    const at = "1,1" as CellKey;
    const botUnit: CardRef = {
      cardId: 42,
      name: "Bot Minion",
      type: "Minion",
      instanceId: "inst_bot",
    };
    store.setState({
      opponentPlayerId: "cpu_1",
      permanents: { [at]: [{ owner: 2, card: botUnit, instanceId: "inst_bot" }] },
    } as unknown as Partial<GameState>);
    store.getState().receiveCustomMessage({
      type: "magicDamage",
      damage: [{ kind: "permanent", at, index: 0, amount: 2 }],
      playerKey: "p1",
    } as unknown as CustomMessage);
    expect(store.getState().permanents[at]?.[0]?.damage).toBe(2);
  });
});

describe("magic targeting intention", () => {
  it("classifies rules text into a target mode and range", () => {
    const cases: Array<[string, string, string, string]> = [
      [
        "Grapple Shot",
        "An ally shoots a projectile. If it hits a unit, the ally is dragged to that location.",
        "projectile",
        "global",
      ],
      ["Chain Lightning", "Deal 2 damage to target unit nearby.", "single", "nearby"],
      ["Lightning Bolt", "Deal 3 damage to a random unit at target location.", "site", "global"],
      [
        "Disenchant",
        "Destroy all auras and artifacts at target location up to two steps away.",
        "site",
        "two-steps",
      ],
      ["Rain of Arrows", "Deal 1 damage to each aboveground minion.", "area", "global"],
      [
        "Psionic Blast",
        "Deal 1 damage to each minion here. They're disabled until your next turn.",
        "area",
        "here",
      ],
      ["Divine Healing", "You gain 7 life.", "none", "global"],
      ["Overpower", "Give an ally +2 power this turn.", "single", "global"],
    ];
    for (const [name, text, mode, range] of cases) {
      const hints = extractMagicTargetingHintsSync(name, text);
      expect({ name, mode: hints.mode, range: hints.range }).toEqual({ name, mode, range });
      expect(hints.fromText).toBe(true);
    }
    expect(extractMagicTargetingHintsSync("Unknown", null).fromText).toBe(false);
  });

  it("measures ranges the Sorcery way", () => {
    const origin = { x: 2, y: 2 };
    expect(isTileInMagicRange("here", origin, { x: 2, y: 2 })).toBe(true);
    expect(isTileInMagicRange("here", origin, { x: 3, y: 2 })).toBe(false);
    expect(isTileInMagicRange("adjacent", origin, { x: 3, y: 2 })).toBe(true);
    expect(isTileInMagicRange("adjacent", origin, { x: 3, y: 3 })).toBe(false);
    expect(isTileInMagicRange("nearby", origin, { x: 3, y: 3 })).toBe(true);
    expect(isTileInMagicRange("nearby", origin, { x: 4, y: 2 })).toBe(false);
    expect(isTileInMagicRange("two-steps", origin, { x: 4, y: 2 })).toBe(true);
    expect(isTileInMagicRange("two-steps", origin, { x: 4, y: 3 })).toBe(false);
    expect(isTileInMagicRange("global", origin, { x: 0, y: 0 })).toBe(true);
  });

  it("builds projectile targets only along a straight line from the caster", () => {
    const avatars = {
      p1: { pos: [2, 3] },
      p2: { pos: [2, 0] },
    } as unknown as GameState["avatars"];
    const pending = {
      id: "mag",
      tile: { x: 0, y: 0 },
      spell: { at: "0,0" as CellKey, index: 0, owner: 1 as const, card: spellCard },
      caster: { kind: "avatar" as const, seat: "p1" as const },
      target: null,
      status: "choosingTarget" as const,
      createdAt: 0,
    };
    expect(getMagicOrigin(pending, avatars)).toEqual({ x: 2, y: 3 });
    expect(projectileDirection({ x: 2, y: 3 }, { x: 2, y: 0 })).toBe("N");
    expect(projectileDirection({ x: 2, y: 3 }, { x: 4, y: 3 })).toBe("E");
    expect(projectileDirection({ x: 2, y: 3 }, { x: 3, y: 1 })).toBeNull();

    const hits = () => ({
      N: { kind: "permanent" as const, at: "2,1" as CellKey, index: 0 },
      E: null,
      S: null,
      W: null,
    });
    const target = buildProjectileTarget(
      pending,
      avatars,
      { x: 2, y: 0 },
      { kind: "avatar", seat: "p2" },
      hits,
    );
    expect(target).toEqual({
      kind: "projectile",
      direction: "N",
      firstHit: { kind: "permanent", at: "2,1", index: 0 },
      intended: { kind: "avatar", seat: "p2" },
    });
    expect(
      buildProjectileTarget(pending, avatars, { x: 3, y: 1 }, null, hits),
    ).toBeNull();
  });
});

describe("spellcaster identification", () => {
  it("recognises casters that are not minions", () => {
    // Artifacts that cast on their own
    for (const n of [
      "Algor Omphalos",
      "Char Omphalos",
      "Dank Omphalos",
      "Torrid Omphalos",
      "Wicker Manikin",
    ])
      expect({ n, is: isSpellcasterCard(n) }).toEqual({ n, is: true });
    // Sites that cast on their own
    for (const n of ["River of Flame", "Merlin's Tower"])
      expect({ n, is: isSpellcasterCard(n) }).toEqual({ n, is: true });
    // Minions, including the two whose keyword line carries an element
    for (const n of [
      "Apprentice Wizard",
      "Merlin",
      "Skeleton Mage",
      "Lava Salamander",
      "Earl of the Ivory Towers",
    ])
      expect({ n, is: isSpellcasterCard(n) }).toEqual({ n, is: true });
  });

  it("does not treat cards that merely mention Spellcasters as casters", () => {
    for (const n of [
      "Maddening Bells",
      "Peacemaker Arbalest",
      "Book of the Dead",
      "De Vermis Mysteriis",
      "The Malleus Maleficarum",
      "Standing Stones",
      "Merlin's Staff",
      "Hand of Glory",
    ])
      expect({ n, is: isSpellcasterCard(n) }).toEqual({ n, is: false });
    // A reference in rules text must not promote an unknown card either
    expect(
      isSpellcasterCard("Some New Card", "Gain 2 for each allied Spellcaster."),
    ).toBe(false);
    // ...but a real keyword line on an unknown card should count
    expect(isSpellcasterCard("Some New Card", "Water Spellcaster")).toBe(true);
  });

  it("knows which artifacts and sites grant Spellcaster to others", () => {
    for (const n of [
      "Merlin's Staff",
      "Hand of Glory",
      "Eerie Coral",
      "Mandrake Jars",
      "Sensu of the Fang",
      "Wiccan Tools",
    ])
      expect({ n, g: isSpellcasterGrantingArtifact(n) }).toEqual({ n, g: true });
    expect(isSpellcasterGrantingArtifact("Book of the Dead")).toBe(false);
    expect(isSpellcasterGrantingSite("Standing Stones")).toBe(true);
    expect(isSpellcasterGrantingSite("River of Flame")).toBe(false);
  });

  it("offers sites, artifacts and granted minions as casters", () => {
    const at = "1,1" as CellKey;
    const pending = {
      id: "mag",
      tile: { x: 1, y: 1 },
      spell: { at, index: 0, owner: 1 as const, card: spellCard },
      caster: null,
      target: null,
      status: "choosingCaster" as const,
      createdAt: 0,
    };
    const unit = (name: string, extra: Record<string, unknown> = {}) => ({
      owner: 1 as const,
      card: { cardId: 1, name, type: "Minion" } as CardRef,
      instanceId: `i_${name}`,
      ...extra,
    });
    const ctx = {
      permanents: {
        [at]: [
          unit("Apprentice Wizard"), // 0: caster by keyword
          unit("Char Omphalos"), // 1: artifact that casts itself
          unit("Sir Lancelot"), // 2: plain minion
          unit("Merlin's Staff", {
            attachedTo: { at, index: 2 },
          }), // 3: grants to index 2
        ],
        "2,2": [unit("Sir Lancelot")], // plain minion on Standing Stones
        "3,3": [{ ...unit("Sir Lancelot"), owner: 2 as const }],
      },
      sites: {
        [at]: { owner: 1 as const, card: { cardId: 2, name: "Plains" } },
        "2,2": { owner: 1 as const, card: { cardId: 3, name: "Standing Stones" } },
        "4,4": { owner: 1 as const, card: { cardId: 4, name: "River of Flame" } },
        "5,5": { owner: 2 as const, card: { cardId: 4, name: "River of Flame" } },
      },
    } as unknown as Parameters<typeof isMagicCasterCandidate>[2];

    const can = (c: Parameters<typeof isMagicCasterCandidate>[1]) =>
      isMagicCasterCandidate(pending, c, ctx);

    expect(can({ kind: "avatar", seat: "p1" })).toBe(true);
    expect(can({ kind: "avatar", seat: "p2" })).toBe(false);
    expect(can({ kind: "permanent", at, index: 0 })).toBe(true); // wizard
    expect(can({ kind: "permanent", at, index: 1 })).toBe(true); // Omphalos
    expect(can({ kind: "permanent", at, index: 2 })).toBe(true); // bears the staff
    expect(can({ kind: "permanent", at, index: 3 })).toBe(false); // the staff itself
    expect(can({ kind: "permanent", at: "2,2" as CellKey, index: 0 })).toBe(true); // Standing Stones
    expect(can({ kind: "permanent", at: "3,3" as CellKey, index: 0 })).toBe(false); // opponent's
    expect(can({ kind: "site", at: "4,4" as CellKey })).toBe(true); // River of Flame
    expect(can({ kind: "site", at: "5,5" as CellKey })).toBe(false); // opponent's site
    expect(can({ kind: "site", at })).toBe(false); // ordinary site
  });
});

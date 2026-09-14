import { io } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotClient } from "../../../../bots/headless-bot-client";
import cardData from "@/lib/game/cpu/cards.json";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";

const card = (name: keyof typeof cardData, id: string = name): CardRef => {
  const data = cardData[name];
  return { cardId: 100, name, type: data.type, text: data.rulesText, instanceId: id,
    cost: data.cost, attack: data.attack, defence: data.defence, thresholds: data.thresholds };
};
const unit = (name: keyof typeof cardData, owner: 1 | 2, id: string, extra: Partial<PermanentItem> = {}): PermanentItem => ({
  owner, card: card(name), instanceId: id, tapped: false, offset: null, ...extra,
});

/** Human p1 attacks; the CPU (p2, Waveshaper) defends. Its Avatar stands next to the attacked site at 2,2. */
function position() {
  const store = createGameStore();
  store.setState({ actorKey: "p1", opponentPlayerId: "cpu_test", currentPlayer: 1, turn: 5, phase: "Main",
    board: { size: { w: 5, h: 4 }, sites: {
      "2,3": { owner: 1, card: card("Lone Tower") },
      "2,2": { owner: 2, card: card("Spring River") },
      "2,1": { owner: 2, card: card("Spring River", "river-2") },
    } }, avatars: {
      p1: { card: card("Sparkmage"), pos: [2,3], tapped: false },
      p2: { card: card("Waveshaper", "waveshaper"), pos: [2,1], tapped: false },
    }, permanents: { "2,2": [unit("Wayfaring Pilgrim",1,"pilgrim")] },
  } as Partial<GameState>);
  return store;
}

const siteAttack = { id: "cmb_site", tile: { x: 2, y: 2 }, target: { kind: "site", at: "2,2", index: null },
  attacker: { at: "2,2", index: 0, owner: 1, instanceId: "pilgrim" } };

function botFor(state: GameState, humanOpponent = true) {
  const bot = new BotClient({ serverUrl: "http://localhost:3010" });
  bot.playerIndex = 1;
  bot._game = state;
  // Avatar defenders are only chosen against a human, whose client resolves them.
  vi.spyOn(bot, "_hasHumanOpponent").mockReturnValue(humanOpponent);
  return bot;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("CPU Avatar defender choice", () => {
  it("defends a site with its Avatar when the strike kills the attacker and life stays high", () => {
    const bot = botFor(position().getState());
    try {
      expect(bot._findBestDefender(siteAttack, false)).toMatchObject({ isAvatar: true, avatarSeat: "p2", at: "2,1", index: -1, to: "2,2", owner: 2 });
    } finally { bot.stop(); }
  });

  it("never picks its Avatar in a CPU-vs-CPU match, whose bots resolve minion defenders only", () => {
    const bot = botFor(position().getState(), false);
    try {
      expect(bot._findBestDefender(siteAttack, false)).toBeNull();
    } finally { bot.stop(); }
  });

  it("intercepts with its Avatar only when already at the mover's location", () => {
    const store = position();
    const offer = { id: "cmb_int", tile: { x: 2, y: 1 }, attacker: { at: "2,1", index: 0, owner: 1, instanceId: "pilgrim" } };
    store.setState({ permanents: { "2,1": [unit("Wayfaring Pilgrim",1,"pilgrim")] } });
    const bot = botFor(store.getState());
    try {
      expect(bot._findBestDefender(offer, true)).toMatchObject({ isAvatar: true, at: "2,1", to: "2,1" });
      store.setState({ avatars: { ...store.getState().avatars, p2: { ...store.getState().avatars.p2, pos: [2,2] } } });
      bot._game = store.getState();
      expect(bot._findBestDefender(offer, true)).toBeNull();
    } finally { bot.stop(); }
  });

  it("does not defend when the attacker survives, the hit is unsafe, the Avatar is at death's door or tapped", () => {
    const store = position();
    const bot = botFor(store.getState());
    try {
      store.setState({ permanents: { "2,2": [unit("Ogre Goons",1,"pilgrim")] } });
      bot._game = store.getState();
      expect(bot._findBestDefender(siteAttack, false)).toBeNull();

      store.setState({ permanents: { "2,2": [unit("Ogre Goons",1,"pilgrim",{ damage: 2 })] },
        players: { ...store.getState().players, p2: { ...store.getState().players.p2, life: 8 } } });
      bot._game = store.getState();
      // 8 life minus the Goons' 3 leaves 5, under the floor of 6.
      expect(bot._findBestDefender(siteAttack, false)).toBeNull();
      store.setState({ players: { ...store.getState().players, p2: { ...store.getState().players.p2, life: 9 } } });
      bot._game = store.getState();
      expect(bot._findBestDefender(siteAttack, false)).toMatchObject({ isAvatar: true });

      store.setState({ players: { ...store.getState().players, p2: { ...store.getState().players.p2, life: 0, lifeState: "dd" } } });
      bot._game = store.getState();
      expect(bot._findBestDefender(siteAttack, false)).toBeNull();

      store.setState({ players: { ...store.getState().players, p2: { ...store.getState().players.p2, life: 20, lifeState: "alive" } },
        avatars: { ...store.getState().avatars, p2: { ...store.getState().avatars.p2, tapped: true } } });
      bot._game = store.getState();
      expect(bot._findBestDefender(siteAttack, false)).toBeNull();
    } finally { bot.stop(); }
  });

  it("never defends an attack on the Avatar itself and respects Airborne interception", () => {
    const store = position();
    store.setState({ avatars: { ...store.getState().avatars, p2: { ...store.getState().avatars.p2, pos: [2,2] } },
      permanents: { "2,2": [unit("Sacred Scarabs",1,"pilgrim")] } });
    const bot = botFor(store.getState());
    try {
      expect(bot._findBestDefender({ ...siteAttack, target: { kind: "avatar", at: "2,2", index: null } }, false)).toBeNull();
      expect(bot._findBestDefender({ ...siteAttack, target: null }, true)).toBeNull();
    } finally { bot.stop(); }
  });

  it("prefers a minion that wins over its Avatar", () => {
    const store = position();
    store.setState({ permanents: { ...store.getState().permanents, "2,1": [unit("Ogre Goons",2,"goons")] } });
    const bot = botFor(store.getState());
    try {
      expect(bot._findBestDefender(siteAttack, false)).toMatchObject({ instanceId: "goons", index: 0 });
    } finally { bot.stop(); }
  });
});

describe("CPU Avatar defender commit", () => {
  function online(bot: InstanceType<typeof BotClient>) {
    const socket = io("http://localhost:3010", { autoConnect: false });
    const emit = vi.spyOn(socket, "emit").mockReturnValue(socket);
    bot.socket = socket;
    vi.spyOn(bot, "_hasHumanOpponent").mockReturnValue(true);
    const actions = () => emit.mock.calls.filter(([event]) => event === "action").map(([,payload]) => (payload as { action: Record<string, unknown> }).action);
    const commits = () => emit.mock.calls.filter(([event, message]) => event === "message" && (message as { type?: string })?.type === "combatCommit")
      .map(([,message]) => (message as { defenders: unknown[] }).defenders);
    return { actions, commits };
  }

  it("moves only its own Avatar, then commits it as an Avatar defender once the move lands", () => {
    vi.useFakeTimers();
    const bot = botFor(position().getState());
    const { actions, commits } = online(bot);
    try {
      bot._handleCombatMessage("attackDeclare", siteAttack);
      vi.advanceTimersByTime(800);
      const [action] = actions();
      expect(Object.keys(action.avatars as object)).toEqual(["p2"]);
      expect(action).toMatchObject({ avatars: { p2: { pos: [2,2], offset: null, tapped: true } } });
      expect(action.permanents).toBeUndefined();
      expect(commits()).toEqual([]);
      bot._acknowledgeCpuAction(action.__cpuActionId);
      expect(commits()).toEqual([[{ at: "2,2", index: -1, instanceId: "waveshaper", owner: 2, isAvatar: true, avatarSeat: "p2" }]]);
    } finally { bot.stop(); }
  });

  it("answers with no defenders when the Avatar move is dropped, and sends nothing for a stale choice", () => {
    vi.useFakeTimers();
    const state = position().getState();
    const bot = botFor(state);
    const { actions, commits } = online(bot);
    try {
      bot._handleCombatMessage("attackDeclare", siteAttack);
      vi.advanceTimersByTime(800);
      expect(actions()).toHaveLength(1);
      bot._dropCpuAction();
      expect(commits()).toEqual([[]]);

      const choice = { isAvatar: true, avatarSeat: "p2", at: "2,1", index: -1, to: "2,2", owner: 2, score: 10 };
      const onDropped = vi.fn();
      bot._game = { ...state, avatars: { ...state.avatars, p2: { ...state.avatars.p2, tapped: true } } };
      expect(bot._commitDefender(choice, vi.fn(), onDropped)).toBeNull();
      expect(actions()).toHaveLength(1);
      expect(onDropped).not.toHaveBeenCalled();
    } finally { bot.stop(); }
  });

  it("intercepts by tapping in place", () => {
    const state = position().getState();
    const bot = botFor(state);
    const { actions } = online(bot);
    try {
      const defender = bot._commitDefender({ isAvatar: true, avatarSeat: "p2", at: "2,1", index: -1, to: "2,1", owner: 2, score: 9 }, vi.fn(), vi.fn());
      expect(defender).toMatchObject({ at: "2,1", index: -1, isAvatar: true, avatarSeat: "p2" });
      expect(actions()[0]).toMatchObject({ avatars: { p2: { tapped: true } } });
      expect((actions()[0].avatars as { p2: object }).p2).not.toHaveProperty("pos");
    } finally { bot.stop(); }
  });
});

describe("CPU Avatar defender adjudication", () => {
  function committed(defenders: NonNullable<GameState["pendingCombat"]>["defenders"], attacker = unit("Ogre Goons",1,"goons",{ damage: 2 })) {
    const store = position();
    store.setState({ avatars: { ...store.getState().avatars, p2: { ...store.getState().avatars.p2, pos: [2,2], tapped: true } },
      permanents: { "2,2": [attacker,unit("Raal Dromedary",2,"camel")] },
      pendingCombat: { id: "cmb", tile: { x: 2, y: 2 }, attacker: { at: "2,2", index: 0, owner: 1, instanceId: attacker.instanceId },
        target: { kind: "site", at: "2,2", index: null }, defenderSeat: "p2", defenders, status: "committed", createdAt: 0 } });
    return store;
  }
  const avatarDefender = { at: "2,2", index: -1, owner: 2 as const, instanceId: "waveshaper", isAvatar: true, avatarSeat: "p2" as const };

  it("keeps a valid Avatar defender from combatCommit and drops one naming another seat", () => {
    const store = position();
    store.setState({ pendingCombat: { ...committed([]).getState().pendingCombat!, status: "declared" } });
    store.getState().receiveCustomMessage({ type: "combatCommit", id: "cmb", playerKey: "p2",
      defenders: [avatarDefender, { ...avatarDefender, avatarSeat: "p1" }, { at: "2,2", index: 1, owner: 2, instanceId: "camel" }] });
    expect(store.getState().pendingCombat?.defenders).toEqual([
      { at: "2,2", index: -1, owner: 2, instanceId: "waveshaper", isAvatar: true, avatarSeat: "p2" },
      { at: "2,2", index: 1, owner: 2, instanceId: "camel" },
    ]);
    expect(store.getState().pendingCombat?.status).toBe("committed");
  });

  it("deals the attacker's strike to the defending player's life and the Avatar's strike to the attacker", () => {
    const store = committed([avatarDefender]);
    store.getState().autoResolveCombat();
    expect(store.getState().pendingCombat).toBeNull();
    expect(store.getState().players.p2.life).toBe(17);
    expect(store.getState().players.p1.life).toBe(20);
    expect(store.getState().zones.p1.graveyard.map(c => c.name)).toEqual(["Ogre Goons"]);
    expect(store.getState().lastCombatSummary?.text).toContain("fight with Waveshaper");
  });

  it("lets a first-striking attacker hit the Avatar first; the Avatar still strikes back", () => {
    const lanced = committed([avatarDefender]);
    lanced.setState({ permanents: { "2,2": [...lanced.getState().permanents["2,2"],
      { owner: 1, card: { cardId: 100, name: "Lance", type: "Artifact" }, instanceId: "lance", tapped: false, offset: null, attachedTo: { at: "2,2", index: 0 } }] } });
    lanced.getState().autoResolveCombat();
    expect(lanced.getState().players.p2.life).toBe(16);
    expect(lanced.getState().zones.p1.graveyard.map(c => c.name)).toContain("Ogre Goons");
  });

  it("uses the attacker's damage assignment for an Avatar alongside a minion", () => {
    const store = committed([avatarDefender, { at: "2,2", index: 1, owner: 2, instanceId: "camel" }], unit("Ogre Goons",1,"goons"));
    store.getState().autoResolveCombat();
    // The human attacker must assign 3 damage first.
    expect(store.getState().pendingCombat?.id).toBe("cmb");
    store.setState({ pendingCombat: { ...store.getState().pendingCombat!, assignment: [{ at: "2,2", index: -1, amount: 2 }, { at: "2,2", index: 1, amount: 1 }] } });
    store.getState().autoResolveCombat();
    expect(store.getState().pendingCombat).toBeNull();
    expect(store.getState().players.p2.life).toBe(18);
    expect(store.getState().permanents["2,2"].find(item => item.instanceId === "camel")?.damage).toBe(1);
    // Waveshaper 1 + Raal Dromedary 2 kill the Goons.
    expect(store.getState().zones.p1.graveyard.map(c => c.name)).toEqual(["Ogre Goons"]);
  });
});

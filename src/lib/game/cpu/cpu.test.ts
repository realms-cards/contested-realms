import { readFileSync } from "node:fs";
import { io } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotClient } from "../../../../bots/headless-bot-client";
import { cpuTurnCleanup } from "../../../../server/modules/cpu-turn-cleanup";
import { __testZoneHelpers } from "../../../../server/modules/match-leader";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import cardData from "@/lib/game/cpu/cards.json";
import { applyDamageEvent } from "@/lib/game/cpu/damage";
import { changeLife } from "@/lib/game/cpu/life";
import { reachableCells } from "@/lib/game/cpu/movement";
import { moveUnit, mergePermanents } from "@/lib/game/cpu/move";
import { betaPrecons } from "@/lib/game/cpu/precons";
import { getSpellChoices, getSpellChoice, projectileKey, unitsInRealm, unitStats } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cardData, id = name): CardRef => {
  const data = cardData[name];
  return { cardId: 100, name, type: data.type, text: data.rulesText, instanceId: id,
    cost: data.cost, attack: data.attack, defence: data.defence, thresholds: data.thresholds };
};
const unit = (name: keyof typeof cardData, owner: 1 | 2, id: string): PermanentItem => ({
  owner, card: card(name), instanceId: id, tapped: false, offset: null,
});

function position() {
  const store = createGameStore();
  store.setState({ actorKey: "p1", opponentPlayerId: "cpu_test", currentPlayer: 1, turn: 3, phase: "Main",
    board: { size: { w: 5, h: 4 }, sites: {
      "0,3": { owner: 1, card: card("Lone Tower") },
      "1,3": { owner: 1, card: card("Lone Tower") },
      "2,3": { owner: 1, card: card("Lone Tower") },
      "2,2": { owner: 2, card: card("Spring River") },
      "4,0": { owner: 2, card: card("Spring River") },
    } }, avatars: {
      p1: { card: card("Sparkmage"), pos: [0,3], tapped: false },
      p2: { card: card("Waveshaper"), pos: [4,0], tapped: false },
    }, permanents: { "0,3": [unit("Cloud Spirit", 1, "ally")], "2,3": [unit("Ogre Goons", 2, "enemy")] },
  } as Partial<GameState>);
  return store;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("CPU precon setup", () => {
  it("keeps all 132 precon card definitions aligned with the official card data", () => {
    const raw: { name: string; guardian: Record<string, unknown>; subTypes?: string }[] = JSON.parse(
      readFileSync("data/cards_raw.json", "utf8"));
    expect(Object.keys(cardData)).toHaveLength(132);
    for (const [name,metadata] of Object.entries(cardData)) {
      const original = raw.find(card => card.name === name);
      expect(original).toBeDefined();
      expect(metadata).toEqual({ name, ...original?.guardian, subTypes: original?.subTypes || "" });
    }
  });
  it.each(betaPrecons)("loads $name with its actual avatar and preserves every copy", deck => {
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const loaded = bot._buildDeckFromConfig(deck);
    expect(loaded.avatar.name).toBe(deck.avatar);
    expect(bot._chooseAvatarCardRef().name).toBe(deck.avatar);
    expect(loaded.book).toHaveLength(36);
    expect(loaded.atlas).toHaveLength(16);
    const all = [...loaded.book, ...loaded.atlas];
    expect(new Set(all.map(c => c.instanceId)).size).toBe(all.length);
    expect(loaded.book.some(c => c.type === "Avatar")).toBe(false);
    const opening = bot._chooseOpeningHand(loaded.book, loaded.atlas);
    expect(opening.handSpells).toHaveLength(3);
    expect(opening.handSites).toHaveLength(3);
    expect(opening.restSpells).toHaveLength(33);
    expect(opening.restSites).toHaveLength(13);
    expect([...opening.handSites, ...opening.restSites].map(c => c.instanceId).sort()).toEqual(loaded.atlas.map(c => c.instanceId).sort());
    bot.stop();
  });
});

describe("CPU life rules", () => {
  it("requires direct damage on a later turn for the death blow", () => {
    const dd = changeLife({ life: 2, lifeState: "alive" }, -3, false, "3:1");
    expect(dd).toMatchObject({ life: 0, lifeState: "dd", deathsDoorTurn: "3:1" });
    expect(changeLife(dd, -20, true, "3:1").lifeState).toBe("dd");
    expect(changeLife(dd, -20, false, "4:2").lifeState).toBe("dd");
    expect(changeLife(dd, 7, false, "4:2").life).toBe(0);
    expect(changeLife(dd, -1, true, "4:2").lifeState).toBe("dead");
  });
  it("enforces these rules in CPU stores while preserving tabletop adjustment behavior", () => {
    const store = position();
    store.getState().addLife("p1", -20, true);
    store.getState().addLife("p1", -1, true);
    expect(store.getState().players.p1.lifeState).toBe("dd");
    store.setState({ turn: 4, currentPlayer: 2 });
    store.getState().addLife("p1", -1, false);
    expect(store.getState().players.p1.lifeState).toBe("dd");
    store.getState().addLife("p1", -1, true);
    expect(store.getState().players.p1.lifeState).toBe("dead");
    const tabletop = createGameStore();
    tabletop.getState().addLife("p1", -20);
    tabletop.getState().addLife("p1", 5);
    expect(tabletop.getState().players.p1).toMatchObject({ life: 5, lifeState: "alive" });
  });
});

describe("shared CPU spell choices", () => {
  it("teleports the selected ally, retaining its tap state and other units", () => {
    const store = position();
    const choice = getSpellChoices(store.getState(), "p1", "Teleport").find(c =>
      c.operations.some(op => op.kind === "move" && op.target.kind === "permanent" && op.to === "4,0"));
    expect(choice).toBeDefined();
    applySpellChoice(store.setState, store.getState, choice!);
    expect(store.getState().permanents["4,0"][0]).toMatchObject({ instanceId: "ally", tapped: false });
    expect(store.getState().permanents["0,3"]).toHaveLength(0);
    expect(store.getState().permanents["2,3"][0].instanceId).toBe("enemy");
  });
  it("bounds Blink destinations relative to the ally", () => {
    const choices = getSpellChoices(position().getState(), "p1", "Blink");
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every(c => c.operations.every(op => op.kind !== "move" || op.to !== "4,0"))).toBe(true);
  });
  it("uses the chosen spellcaster's range and includes friendly fire", () => {
    const store = position();
    store.setState({ permanents: { ...store.getState().permanents,
      "2,3": [unit("Ogre Goons", 2, "enemy"), unit("Apprentice Wizard", 1, "wizard")] } });
    const choices = getSpellChoices(store.getState(), "p1", "Minor Explosion");
    const choice = choices.find(c => c.caster.kind === "avatar" && c.target?.kind === "location" && c.target.at === "2,3");
    expect(choice?.operations[0]).toMatchObject({ kind: "damage", amount: 3, targets: expect.arrayContaining([
      expect.objectContaining({ instanceId: "enemy" }), expect.objectContaining({ instanceId: "wizard" }),
    ]) });
    expect(choices.filter(c => c.caster.kind === "avatar").some(c => c.target?.kind === "location" && c.target.at === "4,0")).toBe(false);
  });
  it("resolves random damage to exactly one unit, including a possible ally", () => {
    const store = position();
    store.setState({ permanents: { "2,3": [unit("Ogre Goons", 2, "enemy"), unit("Cloud Spirit", 1, "ally")] } });
    const choice = getSpellChoices(store.getState(), "p1", "Lightning Bolt").find(c => c.target?.kind === "location" && c.target.at === "2,3")!;
    applySpellChoice(store.setState, store.getState, choice, () => 0);
    expect(store.getState().permanents["2,3"].find(p => p.instanceId === "ally")?.damage || 0).toBe(0);
    expect(store.getState().permanents["2,3"].some(p => p.instanceId === "enemy")).toBe(false);
    expect(store.getState().zones.p2.graveyard.some(c => c.name === "Ogre Goons")).toBe(true);
  });
  it("does not offer Drown on land or Bury on water", () => {
    const state = position().getState();
    expect(getSpellChoices(state, "p1", "Drown")).toHaveLength(0);
    expect(getSpellChoices(state, "p1", "Bury").length).toBeGreaterThan(0);
  });
  it("keeps underwater units out of a surface damage spell", () => {
    const store = position();
    store.setState({ permanentPositions: { enemy: { permanentId: "enemy", state: "submerged", position: { x: 2, y: -1, z: 3 } } } });
    expect(getSpellChoices(store.getState(), "p1", "Minor Explosion").some(c => c.target?.kind === "location" && c.target.at === "2,3")).toBe(false);
  });
});

describe("CPU resolution lifecycle", () => {
  it("retries its first Start phase when opening zones arrive late, without a human action", () => {
    vi.useFakeTimers();
    const state = position().getState();
    const bot = new BotClient({serverUrl:"http://localhost:3010"});
    const socket = io("http://localhost:3010",{autoConnect:false});
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket);
    bot.socket = socket;
    bot.currentMatch = {id:"late-opening-zones",status:"in_progress"};
    bot.playerIndex = 0;
    bot._game = {...state,phase:"Start",turn:1,zones:undefined};
    vi.spyOn(bot,"_hasHumanOpponent").mockReturnValue(true);
    bot._actionPacing.ready("late-opening-zones",Date.now());
    try {
      bot._maybeAct();
      vi.advanceTimersByTime(5000);
      expect(emit).not.toHaveBeenCalledWith("action",expect.anything());
      bot._game.zones = state.zones;
      bot._maybeAct();
      vi.advanceTimersByTime(2000);
      expect(emit).toHaveBeenCalledWith("action",expect.objectContaining({action:expect.objectContaining({phase:"Main"})}));
    } finally {bot.stop();}
  });
  it("plays its opening site with an omitted empty board instead of crashing in ability selection", () => {
    vi.useFakeTimers();
    const state = position().getState();
    const bot = new BotClient({serverUrl:"http://localhost:3010"});
    bot.aiEnabled = true;
    const socket = io("http://localhost:3010",{autoConnect:false});
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket);
    const warn = vi.spyOn(console,"warn").mockImplementation(() => {});
    bot.socket = socket;
    bot.currentMatch = {id:"goldfish-first-site",status:"in_progress"};
    bot.playerIndex = 0;
    bot._game = {...state,board:undefined,permanents:{},turn:1,
      zones:{...state.zones,p1:{...state.zones.p1,hand:[card("Lone Tower")]}}};
    vi.spyOn(bot,"_hasHumanOpponent").mockReturnValue(true);
    vi.spyOn(bot._actionPacing,"delay").mockReturnValue(0);
    try {
      bot._maybeAct();
      expect(warn).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith("action",expect.objectContaining({action:expect.objectContaining({board:expect.objectContaining({sites:expect.objectContaining({"0,3":expect.objectContaining({card:expect.objectContaining({name:"Lone Tower"})})})})})}));
    } finally { bot.stop(); }
  });
  it("continues a human-vs-CPU opening turn when the board has not arrived yet", () => {
    vi.useFakeTimers();
    const bot = new BotClient({serverUrl:"http://localhost:3010"});
    const socket = io("http://localhost:3010",{autoConnect:false});
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket);
    const warn = vi.spyOn(console,"warn").mockImplementation(() => {});
    bot.socket = socket;
    bot.currentMatch = {id:"goldfish-opening",status:"in_progress"};
    bot.playerIndex = 0;
    bot._game = {phase:"Main",currentPlayer:1,turn:1};
    vi.spyOn(bot,"_hasHumanOpponent").mockReturnValue(true);
    vi.spyOn(bot._actionPacing,"delay").mockReturnValue(0);
    try {
      bot._maybeAct();
      expect(warn.mock.calls.some(([message]) => String(message).includes("_maybeAct error"))).toBe(false);
      expect(emit).toHaveBeenCalledWith("action",expect.objectContaining({action:expect.objectContaining({avatars:expect.any(Object)})}));
    } finally { bot.stop(); }
  });
  it("preserves temporary avatar effects through server normalization and clears them explicitly", () => {
    const fallback = { card: card("Sparkmage"),pos: [0,3] as [number,number],tapped: false,
      cpuTurnEffect: { turn: "3:1",power: 2,movement: 1 } };
    expect(__testZoneHelpers.normalizeAvatar({ tapped: true },fallback).cpuTurnEffect).toEqual(fallback.cpuTurnEffect);
    expect(__testZoneHelpers.normalizeAvatar({ cpuTurnEffect: null },fallback).cpuTurnEffect).toBeNull();
    expect(__testZoneHelpers.normalizeAvatar({ cpuTurnEffect: { turn: "3:1",power: Infinity,movement: 1 } },fallback).cpuTurnEffect).toBeUndefined();
  });
  it("resolves its seat from playerIds, and refuses to act when no source names it", () => {
    const bot = new BotClient({ serverUrl: "http://localhost:3010", playerId: "cpu_A" });
    bot.you = { id: "cpu_A", displayName: "CPU" };
    // getPlayerInfo() returns null for a player this instance has no socket for, so `players`
    // can arrive with the human missing and the p2 bot sitting at index 0. Trusting that index
    // made the bot read the human's zones and propose their cards forever.
    expect(
      bot._resolvePlayerIndex({
        playerIds: ["human_1", "cpu_A"],
        players: [{ id: "cpu_A", seat: "p2" }],
      })
    ).toBe(1);
    // Without playerIds, the entry's own seat still outranks its position.
    expect(bot._resolvePlayerIndex({ players: [{ id: "cpu_A", seat: "p2" }] })).toBe(1);
    // Nothing names the seat: stay unresolved rather than defaulting into the opponent's seat.
    bot.playerIndex = -1;
    bot.currentMatch = { id: "m", players: [{ id: "someone_else" }] };
    expect(bot._ensurePlayerIndex()).toBe(false);
    expect(bot.playerIndex).toBe(-1);
    bot.stop();
  });

  it("never re-proposes a card the server rejected, and forgets it next turn", () => {
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const socket = io("http://localhost:3010", { autoConnect: false });
    vi.spyOn(socket,"emit").mockReturnValue(socket);
    bot.socket = socket;
    bot.currentMatch = { id: "rejects", status: "in_progress" };
    bot._turnIndex = 1;
    bot._game = { permanents: { "2,3": [{ instanceId: "onboard", card: { instanceId: "onboard", name: "Ogre Goons" } }] } };
    vi.spyOn(bot,"_hasHumanOpponent").mockReturnValue(true);
    bot._sendCpuAction({ permanents: { "2,3": [
      { instanceId: "onboard", card: { instanceId: "onboard", name: "Ogre Goons" } },
      { instanceId: "fresh", card: { instanceId: "fresh", name: "Spectral Stalker" } },
    ] } }, () => {});
    // The server refuses it (cost_unpaid): the card it tried to play sits out the rest of the turn.
    const inflight = bot._inflightAction;
    expect(inflight).not.toBeNull();
    bot._rememberRejectedAction(inflight?.action);
    expect(bot._rejectedCardIds()).toEqual(["fresh"]);
    bot._turnIndex = 2;
    expect(bot._rejectedCardIds()).toEqual([]);
    bot.stop();
  });
  it("waits for the matching server acknowledgment and ignores duplicate acknowledgments", () => {
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const socket = io("http://localhost:3010", { autoConnect: false });
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket), applied = vi.fn();
    bot.socket = socket;
    vi.spyOn(bot,"_hasHumanOpponent").mockReturnValue(true);
    bot._sendCpuAction({ phase: "Main" },applied);
    const action = emit.mock.calls[0][1].action;
    expect(applied).not.toHaveBeenCalled();
    bot._acknowledgeCpuAction("not-this-action");
    expect(applied).not.toHaveBeenCalled();
    bot._acknowledgeCpuAction(action.__cpuActionId);
    bot._acknowledgeCpuAction(action.__cpuActionId);
    expect(applied).toHaveBeenCalledTimes(1);
    bot.stop();
  });
  it("never waits forever for an acknowledgment: a busy send fails, a silent patch resyncs and is then dropped", () => {
    vi.useFakeTimers();
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const socket = io("http://localhost:3010", { autoConnect: false });
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket), applied = vi.fn(), dropped = vi.fn(), later = vi.fn();
    bot.socket = socket;
    vi.spyOn(bot,"_hasHumanOpponent").mockReturnValue(true);
    vi.spyOn(bot,"_maybeAct").mockImplementation(() => {});
    try {
      expect(bot._sendCpuAction({ phase: "Main" },applied,dropped)).toBe(true);
      const action = emit.mock.calls[0][1].action;
      expect(bot._sendCpuAction({ phase: "Main" },later,later)).toBe(false);
      vi.advanceTimersByTime(8000);
      expect(emit).toHaveBeenCalledWith("resyncRequest",{});
      expect(dropped).not.toHaveBeenCalled();
      vi.advanceTimersByTime(8000);
      expect(dropped).toHaveBeenCalledTimes(1);
      expect(bot._inflightAction).toBeNull();
      // A late acknowledgment of the dropped patch changes nothing.
      bot._acknowledgeCpuAction(action.__cpuActionId);
      expect(applied).not.toHaveBeenCalled();
      expect(later).not.toHaveBeenCalled();
      // A server rejection (or a resync without the action) drops it at once.
      expect(bot._sendCpuAction({ phase: "Main" },applied,dropped)).toBe(true);
      bot._dropCpuAction();
      expect(dropped).toHaveBeenCalledTimes(2);
    } finally { bot.stop(); }
  });
  it("answers an attack with no defenders when its defender move is dropped, instead of hanging", () => {
    vi.useFakeTimers();
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const socket = io("http://localhost:3010", { autoConnect: false });
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket);
    bot.socket = socket;
    bot.playerIndex = 1;
    let dropMove: (() => void) | undefined;
    vi.spyOn(bot,"_findBestDefender").mockReturnValue({ at: "2,2",index: 0,instanceId: "guard",owner: 2,to: "2,1",score: 5 });
    vi.spyOn(bot,"_commitDefender").mockImplementation((...args: unknown[]) => {
      dropMove = args[2] as () => void;
      return { at: "2,1",index: 0,instanceId: "guard",owner: 2 };
    });
    const commits = () => emit.mock.calls.filter(([event,message]) => event === "message" && (message as {type?: string})?.type === "combatCommit")
      .map(([,message]) => (message as {defenders: unknown[]}).defenders);
    try {
      bot._handleCombatMessage("attackDeclare",{ id: "cmb_1",attacker: { at: "2,1",index: 0,owner: 1 },target: { kind: "permanent",at: "2,1",index: 1 },tile: { x: 2,y: 1 } });
      vi.advanceTimersByTime(800);
      expect(commits()).toEqual([]);
      dropMove?.();
      expect(commits()).toEqual([[]]);
    } finally { bot.stop(); }
  });
  it("does not guess unsupported spell effects and waits for explicit manual completion", () => {
    const store = position();
    const unsupported: CardRef = {cardId:999,name:"Browse",type:"Magic"};
    store.setState({ permanents: { ...store.getState().permanents, "1,3": [{...unit("Blaze",1,"manual-spell"),card:unsupported}] },
      pendingMagic: { id: "manual", tile: { x: 1,y: 3 }, spell: { at: "1,3",index: 0,instanceId: "manual-spell",owner: 1,card: unsupported },
        status: "confirm",createdAt: 0 } });
    store.getState().resolveMagic();
    expect(store.getState().pendingMagic?.id).toBe("manual");
    store.getState().endTurn();
    expect(store.getState().currentPlayer).toBe(1);
    store.getState().nextPhase();
    expect(store.getState().phase).toBe("Main");
    store.getState().completeCpuMagicManual();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().zones.p1.graveyard[0]?.name).toBe("Browse");
  });
  it("waits for completion and cancels scheduled work on stop", () => {
    vi.useFakeTimers();
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const act = vi.spyOn(bot, "_maybeAct").mockImplementation(() => {});
    bot._trackResolutionMessage("magicBegin", { id: "spell" });
    expect(bot._pendingResolutions.has("spell")).toBe(true);
    bot._trackResolutionMessage("magicResolve", { id: "spell", playerKey: "p1" });
    expect(bot._pendingResolutions.size).toBe(0);
    bot.stop();
    vi.runAllTimers();
    expect(act).not.toHaveBeenCalled();
  });
  it("answers an intercept offer with a decline instead of leaving the match waiting", () => {
    vi.useFakeTimers();
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const socket = io("http://localhost:3010", { autoConnect: false });
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket);
    bot.socket = socket;
    bot.playerIndex = 1;
    vi.spyOn(bot,"_findBestDefender").mockReturnValue(null);
    const offer = { id: "intercept", tile: { x: 2,y: 3 }, attacker: { at: "2,3", index: 0,owner: 1 } };
    bot._handleCombatMessage("interceptOffer",offer);
    vi.advanceTimersByTime(800);
    expect(emit).toHaveBeenCalledWith("message",expect.objectContaining({ type: "combatCommit",id: "intercept",defenders: [] }));
    bot.stop();
  });
  it("only intercepts at the same location and respects Airborne restrictions", () => {
    const store = position();
    store.setState({ permanents: { "2,3": [unit("Cloud Spirit",1,"mover"),unit("Ogre Goons",2,"ground")],
      "1,3": [unit("Cloud Spirit",2,"remote")] } });
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    bot.playerIndex = 1;
    bot._game = store.getState();
    const offer = { tile: { x: 2,y: 3 }, attacker: { at: "2,3",index: 0,owner: 1,instanceId: "mover" } };
    expect(bot._findBestDefender(offer,true)).toBeNull();
    store.setState({ permanents: { "2,3": [unit("Cloud Spirit",1,"mover"),unit("Plumed Pegasus",2,"flyer")] } });
    bot._game = store.getState();
    expect(bot._findBestDefender(offer,true)?.instanceId).toBe("flyer");
    bot.stop();
  });
  it("retains the human mover's CPU intercept offer and closes a decline without site damage", () => {
    const store = position();
    const offer = { type: "interceptOffer", id: "intercept",playerKey: "p1",tile: { x: 0,y: 3 },
      attacker: { at: "0,3",index: 0,owner: 1,instanceId: "ally" } };
    store.getState().receiveCustomMessage(offer);
    expect(store.getState().pendingCombat?.id).toBe("intercept");
    store.getState().receiveCustomMessage({ type: "combatCommit", id: "intercept",playerKey: "p2",defenders: [] });
    expect(store.getState().pendingCombat).toBeNull();
    expect(store.getState().players.p2.life).toBe(20);
    store.setState({ opponentPlayerId: "human_opponent" });
    store.getState().receiveCustomMessage(offer);
    expect(store.getState().pendingCombat).toBeNull();
  });
  it("offers interception when the CPU moves but has no legal attack", () => {
    const store = position();
    const bot = new BotClient({ serverUrl: "http://localhost:3010" });
    const socket = io("http://localhost:3010", { autoConnect: false });
    const emit = vi.spyOn(socket,"emit").mockReturnValue(socket);
    bot.socket = socket;
    bot._game = store.getState();
    vi.spyOn(bot,"_hasHumanOpponent").mockReturnValue(true);
    bot._triggerCombat({ toKey: "0,3",attackerIndex: 0,tile: { x: 0,y: 3 } },"p1");
    expect(emit).toHaveBeenCalledWith("message",expect.objectContaining({ type: "interceptOffer",attacker: expect.objectContaining({ instanceId: "ally" }) }));
    expect(bot._pendingResolutions.size).toBe(1);
    bot.stop();
  });
  it("resolves the CPU's selected spell through the human store without removing an unrelated permanent", () => {
    const store = position();
    const sent: unknown[] = [];
    const transport = Object.assign(new LocalTransport(), {
      sendMessage: (message: unknown) => { sent.push(message); }, sendAction: vi.fn(),
    });
    store.setState({ actorKey: "p2", opponentPlayerId: "cpu_test",
      transport });
    const choice = getSpellChoices(store.getState(), "p1", "Teleport").find(c => c.operations.some(op => op.kind === "move" && op.target.kind === "permanent" && op.to === "4,0"))!;
    store.getState().receiveCustomMessage({ type: "magicBegin", id: "cpu-spell", playerKey: "p1", tile: { x: 0, y: 3 },
      spell: { at: "0,3", index: -1, owner: 1, card: card("Teleport"), instanceId: "cast-spell" } });
    store.getState().receiveCustomMessage({ type: "cpuMagicChoice", id: "cpu-spell", key: choice.key, playerKey: "p1" });
    store.getState().resolveMagic();
    expect(store.getState().permanents["4,0"][0].instanceId).toBe("ally");
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().zones.p1.graveyard).toHaveLength(0);
    expect(sent).toContainEqual(expect.objectContaining({ type: "magicResolve", id: "cpu-spell" }));
  });
});

describe("CPU movement", () => {
  it("moves attachments and merges partial damage without erasing other units", () => {
    const store = position();
    store.setState({ permanents: { "0,3": [unit("Cloud Spirit", 1, "ally"),
      { ...unit("Ogre Goons", 1, "carried"), attachedTo: { at: "0,3", index: 0 } },
      unit("Ogre Goons", 1, "stays")], "1,3": [unit("Ogre Goons", 2, "enemy")] } });
    const moved = moveUnit(store.getState(), "0,3", 0, "1,3")!;
    const per = mergePermanents(store.getState().permanents, moved.patch.permanents);
    expect(per["0,3"]).toHaveLength(1);
    expect(per["1,3"]).toHaveLength(3);
    expect(per["1,3"][2]).toMatchObject({ instanceId: "carried", attachedTo: { at: "1,3", index: 1 } });
    expect(mergePermanents(per, { "1,3": [{ instanceId: "ally", damage: 1 }] })["1,3"]).toHaveLength(3);
    expect(moveUnit(store.getState(), "0,3", 0, "0,3")!.patch.permanents["0,3"]).toHaveLength(3);
  });
  it("permits airborne diagonal movement but does not cross intervening void on foot", () => {
    const state = position().getState();
    expect(reachableCells(state, "1,3", unit("Cloud Spirit", 1, "flyer"))).toContain("2,2");
    expect(reachableCells(state, "1,3", unit("Ogre Goons", 1, "walker"))).not.toContain("2,2");
    expect(reachableCells(state, "0,3", unit("Cloud Spirit", 1, "flyer"))).not.toContain("0,2");
  });
});

describe("CPU projectile choices", () => {
  it("shoots from the origin, ignores allies there, and stops at the first occupied location", () => {
    const state = position().getState();
    const east = getSpellChoice(state, "p1", "Fireball", "p1/E")!;
    expect(east.operations[0]).toMatchObject({ kind: "damage", amount: 4, targets: [expect.objectContaining({ instanceId: "enemy" })] });
    expect(getSpellChoice(state, "p1", "Fireball", "p1/N")?.operations).toHaveLength(0);
  });
  it("resolves firebolts sequentially, continuing past a killed blocker", () => {
    const store = position();
    store.setState({ permanents: { "1,3": [unit("Apprentice Wizard", 2, "blocker")], "2,3": [unit("Ogre Goons", 2, "rear")] } });
    const choice = getSpellChoice(store.getState(), "p1", "Firebolts", "p1/E")!;
    expect(choice.operations).toHaveLength(3);
    expect(choice.operations[0]).toMatchObject({ targets: [expect.objectContaining({ instanceId: "blocker" })] });
    expect(choice.operations[1]).toMatchObject({ targets: [expect.objectContaining({ instanceId: "rear" })] });
    applySpellChoice(store.setState, store.getState, choice);
    expect(store.getState().permanents["1,3"]).toHaveLength(0);
    expect(store.getState().permanents["2,3"][0].damage).toBe(2);
  });
  it("lets the caster choose the hit unit and limits piercing hits to one per location", () => {
    const store = position();
    store.setState({ permanents: { "1,3": [unit("Ogre Goons", 2, "first"), unit("Ogre Goons", 1, "friend")],
      "2,3": [unit("Ogre Goons", 2, "second")] } });
    const key = projectileKey("p1/E", ["friend", "second"]);
    const choice = getSpellChoice(store.getState(), "p1", "Heat Ray", key)!;
    expect(choice.operations).toHaveLength(2);
    expect(choice.operations[0]).toMatchObject({ targets: [expect.objectContaining({ instanceId: "friend" })], amount: 2 });
    applySpellChoice(store.setState, store.getState, choice);
    expect(store.getState().permanents["1,3"][0].damage || 0).toBe(0);
    expect(store.getState().permanents["1,3"][1].damage).toBe(2);
  });
  it("counts empty locations and the origin for Ice Lance's decreasing damage", () => {
    const choice = getSpellChoice(position().getState(), "p1", "Ice Lance", "p1/E")!;
    expect(choice.operations).toEqual([{ kind: "damage", amount: 1, targets: [expect.objectContaining({ instanceId: "enemy" })] }]);
  });
});

describe("live sequential projectile resolution", () => {
  async function settle() { for (let i=0;i<10;i++) await Promise.resolve(); }
  function online(store: ReturnType<typeof position>) {
    const transport = Object.assign(new LocalTransport(),{sendMessage:vi.fn(),sendAction:vi.fn()});
    store.setState({matchId:"projectile-test",transport});
    return transport;
  }
  function cast(store: ReturnType<typeof position>, name: "Firebolts" | "Fireball" | "Heat Ray" | "Ice Lance") {
    store.getState().beginMagicCast({tile:{x:0,y:3},spell:{at:"0,3",index:-1,owner:1,card:card(name),instanceId:"original-projectile"}});
    const id = store.getState().pendingMagic!.id;
    store.getState().setCpuMagicChoice("p1/E");
    store.getState().resolveMagic();
    return id;
  }
  function interruptFirstDamage(store: ReturnType<typeof position>) {
    return store.subscribe((state,previous) => {
      if (state.permanents["1,3"]?.[0]?.damage && !previous.permanents["1,3"]?.[0]?.damage) {
        // Two outcomes keep the interruption a prompt; a lone outcome resolves unprompted.
        store.setState({cpuEffectRequests:[{id:"intervening-event",tile:{x:0,y:3},spell:{at:"0,3",index:-1,owner:1,card:card("Lucky Charm")},
          cpuEvent:{kind:"randomChoice",outcomes:[{kind:"gainMana",seat:"p1",amount:0},{kind:"gainMana",seat:"p1",amount:0}]},status:"choosingTarget",createdAt:0}]});
      }
    });
  }
  async function resolve(store: ReturnType<typeof position>, key: string) {
    store.getState().setCpuMagicChoice(key);
    store.getState().resolveMagic();
    await settle();
  }
  it("offers fresh choices for each bolt after triggers and completes the original cast once", async () => {
    const store = position();
    store.setState({permanents:{"1,3":[unit("Ogre Goons",2,"blocker")],"2,3":[unit("Mountain Giant",2,"rear")]}});
    const transport = online(store), unsubscribe = interruptFirstDamage(store);
    const id = cast(store,"Firebolts");
    unsubscribe();
    await settle();
    expect(store.getState().pendingMagic?.id).toBe("intervening-event");
    expect(store.getState().permanents["1,3"][0].damage).toBe(1);
    store.setState({permanents:{...store.getState().permanents,"1,3":[unit("Mountain Giant",2,"arrival-a"),unit("Ogre Goons",2,"arrival-b")]}});
    await resolve(store,"random/0");
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("projectileImpact");
    expect(getSpellChoices(store.getState(),"p1","Firebolts").map(c => c.key)).toEqual(["arrival-a","arrival-b"]);
    const completed = () => transport.sendMessage.mock.calls.filter(([message]) => message.type === "magicResolve" && message.id === id);
    expect(completed()).toHaveLength(0);
    await resolve(store,"arrival-a");
    expect(store.getState().pendingMagic?.cpuEvent).toMatchObject({kind:"projectileImpact",projectile:{shot:2}});
    expect(completed()).toHaveLength(0);
    await resolve(store,"arrival-b");
    expect(store.getState().permanents["1,3"].map(item => item.damage)).toEqual([1,1]);
    expect(store.getState().permanents["2,3"][0].damage || 0).toBe(0);
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
    expect(completed()).toHaveLength(1);
    store.getState().resolveMagic();
    expect(completed()).toHaveLength(1);
  });
  it.each(["Heat Ray","Ice Lance"] as const)("%s hits a new occupant, not the unit that left during interruption", async name => {
    const store = position();
    // Single-location units: an oversized Mountain Giant at 1,3 would also stand at 2,3.
    store.setState({permanents:{"1,3":[unit("Amazon Warriors",2,"first")],"2,3":[unit("Amazon Warriors",2,"departed")]}});
    online(store);
    const unsubscribe = interruptFirstDamage(store);
    cast(store,name);
    unsubscribe();
    await settle();
    const departed = store.getState().permanents["2,3"][0];
    store.setState({permanents:{...store.getState().permanents,"2,3":[unit("Amazon Warriors",2,"arrival")],"4,0":[departed]}});
    await resolve(store,"random/0");
    expect(store.getState().permanents["1,3"][0].damage).toBe(2);
    expect(store.getState().permanents["2,3"][0].damage).toBe(name === "Heat Ray" ? 2 : 1);
    expect(store.getState().permanents["4,0"][0].damage || 0).toBe(0);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("stops a piercing flight at a newly created region boundary", async () => {
    const store = position();
    store.setState({permanents:{"1,3":[unit("Mountain Giant",2,"first")],"2,3":[unit("Mountain Giant",2,"rear")]}});
    online(store);
    const unsubscribe = interruptFirstDamage(store);
    cast(store,"Heat Ray");
    unsubscribe();
    await settle();
    const sites = {...store.getState().board.sites};
    delete sites["2,3"];
    store.setState({board:{...store.getState().board,sites}});
    await resolve(store,"random/0");
    expect(store.getState().permanents["2,3"][0].damage || 0).toBe(0);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("revalidates a pending impact and applies Fireball splash simultaneously", async () => {
    const store = position();
    store.setState({permanents:{"1,3":[unit("Mountain Giant",2,"a"),unit("Mountain Giant",2,"b")]}});
    online(store);
    cast(store,"Fireball");
    await settle();
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("projectileImpact");
    store.setState({permanents:{"1,3":[unit("Mountain Giant",2,"b"),unit("Mountain Giant",2,"c")]}});
    expect(getSpellChoices(store.getState(),"p1","Fireball").map(c => c.key)).toEqual(["b","c"]);
    await resolve(store,"c");
    expect(store.getState().permanents["1,3"].map(item => item.damage)).toEqual([2,4]);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("lets the CPU choose live impacts without requiring human confirmation", async () => {
    const store = position();
    store.setState({actorKey:"p2",permanents:{"1,3":[unit("Mountain Giant",1,"ally"),unit("Mountain Giant",2,"enemy")]}});
    online(store);
    applySpellChoice(store.setState,store.getState,getSpellChoice(store.getState(),"p1","Firebolts","p1/E")!);
    await settle();
    expect(store.getState().permanents["1,3"][0].damage || 0).toBe(0);
    expect(store.getState().permanents["1,3"][1].damage).toBe(3);
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
  });
});

describe("CPU combat and damage", () => {
  function fight() {
    const store = position();
    store.setState({ permanents: { "2,3": [unit("Ogre Goons",1,"attacker"),unit("Ogre Goons",2,"defender")] },
      pendingCombat: { id: "fight", tile: { x: 2, y: 3 }, attacker: { at: "2,3", index: 0, owner: 1, instanceId: "attacker" },
        target: { kind: "permanent", at: "2,3", index: 1 }, defenderSeat: "p2", defenders: [], status: "committed", createdAt: 0 } });
    return store;
  }
  it("resolves simultaneous lethal strikes and clears the interaction exactly once", () => {
    const store = fight();
    store.getState().autoResolveCombat();
    expect(store.getState().permanents["2,3"]).toHaveLength(0);
    expect(store.getState().zones.p1.graveyard).toHaveLength(1);
    expect(store.getState().zones.p2.graveyard).toHaveLength(1);
    expect(store.getState().pendingCombat).toBeNull();
    store.getState().autoResolveCombat();
    expect(store.getState().zones.p2.graveyard).toHaveLength(1);
  });
  it("strikes back when an avatar is attacked", () => {
    const store = fight();
    store.setState({ avatars: { ...store.getState().avatars, p2: { ...store.getState().avatars.p2, pos: [2,3] } },
      pendingCombat: { ...store.getState().pendingCombat!, target: { kind: "avatar", at: "2,3", index: null } } });
    store.getState().autoResolveCombat();
    expect(store.getState().players.p2.life).toBe(17);
    expect(store.getState().permanents["2,3"][0].damage).toBe(1);
  });
  it("automatically allocates the CPU's damage when multiple human units defend", () => {
    const store = fight();
    store.setState({ actorKey: "p2", opponentPlayerId: "cpu_test", permanents: {
      "2,3": [unit("Ogre Goons",1,"attacker"),unit("Cloud Spirit",2,"one"),unit("Cloud Spirit",2,"two")],
    }, pendingCombat: { ...store.getState().pendingCombat!, target: { kind: "site", at: "2,3", index: null },
      defenders: [{ at: "2,3", index: 1, owner: 2, instanceId: "one" },{ at: "2,3", index: 2, owner: 2, instanceId: "two" }] } });
    store.getState().autoResolveCombat();
    expect(store.getState().pendingCombat).toBeNull();
    expect(store.getState().zones.p2.graveyard).toHaveLength(1);
  });
  it("applies Lethal only when positive damage is dealt", () => {
    const store = fight();
    store.setState({ permanents: { "2,3": [unit("Pit Vipers",1,"attacker"),unit("Mountain Giant",2,"defender")] } });
    store.getState().autoResolveCombat();
    expect(store.getState().zones.p2.graveyard[0]?.name).toBe("Mountain Giant");
  });
  it("does not make an Escyllion Cyclops strike back while defending", () => {
    const store = fight();
    store.setState({ permanents: { "2,3": [unit("Ogre Goons",1,"attacker"),unit("Escyllion Cyclops",2,"defender")] } });
    store.getState().autoResolveCombat();
    expect(store.getState().permanents["2,3"].find(item => item.instanceId === "attacker")?.damage || 0).toBe(0);
  });
  it("prevents the Turtles' first damage event each turn, then allows damage", () => {
    const store = position();
    store.setState({ permanents: { "2,3": [unit("Tufted Turtles",2,"turtles")] } });
    const hit = { target: { kind: "permanent" as const, at: "2,3", index: 0, instanceId: "turtles" }, amount: 1 };
    applyDamageEvent(store.setState,store.getState,[hit]);
    expect(store.getState().permanents["2,3"][0].damage).toBe(0);
    applyDamageEvent(store.setState,store.getState,[hit]);
    expect(store.getState().permanents["2,3"][0].damage).toBe(1);
    store.setState({ turn: 4 });
    applyDamageEvent(store.setState,store.getState,[hit]);
    expect(store.getState().permanents["2,3"][0].damage).toBe(1);
  });
  it("replaces fire damage to the Phoenix with temporary power", () => {
    const store = position();
    store.setState({ permanents: { "2,3": [unit("Askelon Phoenix",2,"phoenix")] } });
    const choice = getSpellChoice(store.getState(),"p1","Fireball","p1/E")!;
    applySpellChoice(store.setState,store.getState,choice);
    const item = store.getState().permanents["2,3"][0];
    expect(item.damage).toBe(0);
    expect(item.cpuTurnEffect?.power).toBe(1);
  });
  it("expires buffs and clears both sides' damage, not avatar life", () => {
    const store = fight();
    const choice = getSpellChoices(store.getState(),"p1","Overpower").find(choice => choice.target?.kind === "permanent")!;
    applySpellChoice(store.setState,store.getState,choice);
    const unit = unitsInRealm(store.getState()).find(unit => unit.target.kind === "permanent" && unit.target.instanceId === "attacker")!;
    expect(unitStats(store.getState(),unit).atk).toBe(5);
    const cleanup = cpuTurnCleanup(store.getState());
    expect(cleanup.permanents["2,3"][0].cpuTurnEffect).toBeNull();
    expect(cleanup.permanents["2,3"][1].damage).toBeNull();
    expect(cleanup).not.toHaveProperty("players");
  });
});

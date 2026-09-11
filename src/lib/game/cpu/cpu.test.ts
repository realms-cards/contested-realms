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
  it("preserves temporary avatar effects through server normalization and clears them explicitly", () => {
    const fallback = { card: card("Sparkmage"),pos: [0,3] as [number,number],tapped: false,
      cpuTurnEffect: { turn: "3:1",power: 2,movement: 1 } };
    expect(__testZoneHelpers.normalizeAvatar({ tapped: true },fallback).cpuTurnEffect).toEqual(fallback.cpuTurnEffect);
    expect(__testZoneHelpers.normalizeAvatar({ cpuTurnEffect: null },fallback).cpuTurnEffect).toBeNull();
    expect(__testZoneHelpers.normalizeAvatar({ cpuTurnEffect: { turn: "3:1",power: Infinity,movement: 1 } },fallback).cpuTurnEffect).toBeUndefined();
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

import { describe, expect, it } from "vitest";
import cards from "@/lib/game/cpu/cards.json";
import type { SpellState } from "@/lib/game/cpu/spellTypes";
import { getSpellChoices, isWater, projectileKey, unitsInRealm } from "@/lib/game/cpu/spells";
import type { CardRef, PermanentItem, Permanents, Zones } from "@/lib/game/store/types";

const card = (name: keyof typeof cards, id: string): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const zones = (): Zones => ({spellbook:[],atlas:[],hand:[],graveyard:[],battlefield:[],collection:[],banished:[]});

/** 40 minions on a fully owned board; 20 friendly Spellcasters can each start a chain through the crowd. */
function crowdedRealm(): SpellState {
  const sites: SpellState["board"]["sites"] = {};
  for (let i=0;i<20;i++) sites[`${i%5},${Math.floor(i/5)}`] = {owner:1,card:card("Arid Desert",`site${i}`)};
  const bodies = ["Ogre Goons","Pit Vipers","Quarrelsome Kobolds","Sacred Scarabs","Rimland Nomads","Petrosian Cavalry"] as const;
  const casters = ["Apprentice Wizard","Grandmaster Wizard"] as const;
  const permanents: Permanents = {};
  for (let i=0;i<40;i++) {
    const caster = i<20;
    const item: PermanentItem = {owner:caster || i%2 ? 1 : 2,card:card(caster ? casters[i%2] : bodies[i%6],`u${i}`),instanceId:`u${i}`,tapped:false};
    (permanents[`${i%5},${Math.floor(i/5)%4}`] ||= []).push(item);
  }
  return {turn:5,currentPlayer:1,board:{size:{w:5,h:4},sites},permanents,permanentPositions:{},
    avatars:{p1:{card:card("Flamecaller","av1"),pos:[2,3],tapped:false},p2:{card:card("Geomancer","av2"),pos:[2,0],tapped:false}},
    players:{p1:{life:20,lifeState:"alive",mana:0},p2:{life:20,lifeState:"alive",mana:0}},zones:{p1:zones(),p2:zones()}};
}

/** FNV-1a over the serialized choices, without the board-pick metadata (picks, decision option `at`, a choice's pickLabels / card / badge) this pin does not cover. */
function digest(value: unknown) {
  const text = JSON.stringify(value,function (this: unknown, key: string, field: unknown) {
    return key === "picks" || (["at","pickLabels","card","badge"].includes(key) && typeof this === "object" && this !== null && "key" in this && "label" in this) ? undefined : field;
  });
  let hash = 0x811c9dc5;
  for (let i=0;i<text.length;i++) hash = Math.imul(hash ^ text.charCodeAt(i),0x01000193);
  return (hash >>> 0).toString(16);
}

describe("per-snapshot evaluation cache", () => {
  it("keeps crowded Chain Lightning choices identical to the uncached evaluation", () => {
    const state = crowdedRealm();
    const choices = getSpellChoices(state,"p1","Chain Lightning");
    const plan = choices[7]?.projectile;
    expect(plan).toBeDefined();
    const key = projectileKey(plan?.baseKey ?? "",[plan?.decisions[0]?.options[2]?.key ?? "","stop"]);
    const narrowed = getSpellChoices(state,"p1","Chain Lightning",key);
    expect(choices).toHaveLength(285);
    expect(narrowed.some(choice => choice.key === key)).toBe(true);
    // Recorded from the implementation that rescanned the realm for every score (84,025 scans; full digest 7ee7f6aa),
    // re-derived from that pre-metadata output with the board-pick metadata removed.
    expect(digest([choices,narrowed])).toBe("49c49fd2");
  });

  it("scans the realm once per evaluation", () => {
    const state = crowdedRealm();
    let scans = 0;
    const permanents = new Proxy(state.permanents,{ownKeys: target => { scans++; return Reflect.ownKeys(target); }});
    getSpellChoices({...state,permanents},"p1","Chain Lightning");
    expect(scans).toBeLessThanOrEqual(2);
  });

  it("never serves facts cached before an in-place mutation", () => {
    const state = crowdedRealm();
    getSpellChoices(state,"p1","Chain Lightning");
    expect(isWater(state,"0,0")).toBe(false);
    state.permanents["0,0"].push({owner:2,card:card("Tide Naiads","naiads"),instanceId:"naiads",tapped:false});
    expect(isWater(state,"0,0")).toBe(true);
    const units = unitsInRealm(state);
    expect(units).toHaveLength(43);
    expect(unitsInRealm(state)[0]).not.toBe(units[0]);
    expect(getSpellChoices(state,"p1","Chain Lightning").some(choice => choice.key.endsWith("/chain:naiads"))).toBe(true);
  });
});

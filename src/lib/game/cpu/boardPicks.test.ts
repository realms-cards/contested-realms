import { describe, expect, it } from "vitest";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import cards from "@/lib/game/cpu/cards.json";
import { getSpellChoices } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PendingMagic, PermanentItem, SiteTile } from "@/lib/game/store/types";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, id: string, owner: 1 | 2 = 2): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
/** 5x4 board of Lone Towers (p1 owns the home row), p1 avatar at 2,3. No CPU opponent, so no controller reacts. */
function setup(permanents: GameState["permanents"], sites: Record<string, SiteTile> = {}) {
  const store = createGameStore();
  store.setState({actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    board:{size:{w:5,h:4},sites:{...Object.fromEntries(Array.from({length:20},(_,i) => [`${i%5},${Math.floor(i/5)}`,{owner:Math.floor(i/5) === 3 ? 1 : 2,card:card("Lone Tower",`site${i}`)}])),...sites}},
    avatars:{p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[4,0],tapped:false}},permanents,permanentPositions:{},
  } as Partial<GameState>);
  return store.getState();
}
const pending = (spell: CardRef, cpuEvent: PendingMagic["cpuEvent"]): PendingMagic => ({id:"event",tile:{x:2,y:2},spell:{at:"2,2",index:-1,owner:1,card:spell},cpuEvent,status:"choosingTarget",createdAt:0});
const picksOf = (choices: {key: string; picks?: (string | string[])[]}[], key: string) => choices.find(choice => choice.key === key)?.picks;

describe("board-pick metadata", () => {
  it("projectile directions accept any location the flight reaches after its origin", () => {
    const state = setup({"2,1":[unit("Ogre Goons","goon")]});
    const fireball = getSpellChoices(state,"p1","Fireball");
    expect(picksOf(fireball,"p1/N")).toEqual([["2,2","2,1","2,0"]]);
    expect(picksOf(fireball,"p1/E")).toEqual([["3,3","4,3"]]);
    expect(picksOf(fireball,"p1/S")).toEqual([]);
    expect(fireball.find(choice => choice.key === "p1/N")?.projectile?.decisions[0].options).toEqual([{key:"goon",label:"Ogre Goons (enemy) at Tile #8",at:"2,1"}]);
    expect(picksOf(getSpellChoices(state,"p1","Ice Lance"),"p1/N")).toEqual([["2,2","2,1"]]);
  });
  it("Chain Lightning picks its first target and marks each chain option's tile", () => {
    const state = setup({"2,2":[unit("Ogre Goons","g1")],"3,2":[unit("Ogre Goons","g2")]});
    const chain = getSpellChoices(state,"p1","Chain Lightning").find(choice => choice.key === "p1/chain:g1");
    expect(chain?.picks).toEqual(["2,2"]);
    expect(chain?.projectile?.decisions[0].options.map(option => [option.key,option.at])).toEqual([["stop",undefined],["g2","3,2"],["p1","2,3"]]);
  });
  it("gives a decision option a tile only when no other option shares it", () => {
    const optionTiles = (options: {key: string; at?: string}[] | undefined) => options?.map(option => [option.key,"at" in option ? option.at : null]);
    const pair = setup({"2,1":[unit("Ogre Goons","goons"),unit("Cave Trolls","trolls")]});
    expect(optionTiles(getSpellChoices(pair,"p1","Fireball").find(choice => choice.key === "p1/N")?.projectile?.decisions[0].options)).toEqual([["goons",null],["trolls",null]]);
    const chain = setup({"2,2":[unit("Ogre Goons","g1")],"3,2":[unit("Cave Trolls","t1"),unit("Pit Vipers","v1")]});
    expect(optionTiles(getSpellChoices(chain,"p1","Chain Lightning").find(choice => choice.key === "p1/chain:g1")?.projectile?.decisions[0].options)).toEqual([["stop",null],["t1",null],["v1",null],["p1","2,3"]]);
  });
  it("Thunderstorm picks any tile it covers to stay, or a tile only the moved storm covers", () => {
    const state = setup({"1,1":[unit("Thunderstorm","storm",1)]});
    const choices = getSpellChoices({...state,pendingMagic:pending(card("Thunderstorm","storm"),{kind:"auraEnd",source:{kind:"permanent",at:"1,1",index:0,instanceId:"storm"}})},"p1","Thunderstorm");
    expect(choices.map(choice => [choice.key,choice.picks])).toEqual([
      ["storm/1,1",[["1,1","2,1","1,2","2,2"]]],["storm/0,1",[["0,1","0,2"]]],["storm/2,1",[["3,1","3,2"]]],["storm/1,0",[["1,0","2,0"]]],["storm/1,2",[["1,3","2,3"]]],
    ]);
  });
  it("Teleport picks the ally, then its destination", () => {
    expect(picksOf(getSpellChoices(setup({}),"p1","Teleport"),"p1/2,3:p1/0,0")).toEqual(["2,3","0,0"]);
    expect(picksOf(getSpellChoices(setup({}),"p1","Divine Healing"),"p1/heal")).toBeUndefined();
  });
  it("Rolling Boulder picks any location along the roll, Sinkhole the site to destroy", () => {
    const state = setup({"1,3":[unit("Ogre Goons","pusher",1),unit("Rolling Boulder","rb",1)]},{"0,3":{owner:1,card:card("Sinkhole","sink")}});
    const choices = abilityChoices(state,"p1");
    expect(picksOf(choices,"boulder/pusher/rb/N")).toEqual([["1,2","1,1","1,0"]]);
    expect(picksOf(choices,"boulder/pusher/rb/E")).toEqual([["2,3","3,3","4,3"]]);
    expect(picksOf(choices,"boulder/pusher/rb/S")).toEqual([]);
    expect(picksOf(choices,"sinkhole/sink/1,2")).toEqual(["1,2"]);
  });
  it("Sunken Treasure picks the water site; Bullfrog's Genesis picks the swallowed minion's tile", () => {
    const water = {"0,3":{owner:1 as const,card:card("Autumn River","river1")},"4,3":{owner:1 as const,card:card("Autumn River","river2")}};
    const treasure = setup({"2,2":[unit("Sunken Treasure","st",1)]},water);
    const place = getSpellChoices({...treasure,pendingMagic:pending(card("Sunken Treasure"),{kind:"treasurePlace",source:{kind:"permanent",at:"2,2",index:0,instanceId:"st"},castOwner:1})},"p1","Sunken Treasure");
    expect(place.map(choice => [choice.key,choice.picks])).toEqual([["treasure/place/0,3",["0,3"]],["treasure/place/4,3",["4,3"]]]);
    const frog = setup({"2,2":[unit("Brobdingnag Bullfrog","frog",1),unit("Ogre Goons","prey")]});
    const genesis = getSpellChoices({...frog,pendingMagic:pending(card("Brobdingnag Bullfrog","frog"),{kind:"genesis",region:"surface",source:{kind:"permanent",at:"2,2",index:0,instanceId:"frog"}})},"p1","Brobdingnag Bullfrog");
    expect(picksOf(genesis,"genesis/prey")).toEqual(["2,2"]);
  });
});

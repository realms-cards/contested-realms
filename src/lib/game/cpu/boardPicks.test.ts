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
const pending = (spell: CardRef, cpuEvent?: PendingMagic["cpuEvent"], extra: Partial<PendingMagic> = {}): PendingMagic => ({id:"event",tile:{x:2,y:2},spell:{at:"2,2",index:-1,owner:1,card:spell},...(cpuEvent ? {cpuEvent} : {}),status:"choosingTarget",createdAt:0,...extra});
const hand = (state: GameState, cardsInHand: CardRef[]): GameState => ({...state,zones:{...state.zones,p1:{...state.zones.p1,hand:cardsInHand}}});
type Picked = {key: string; picks?: (string | string[])[]; pickLabels?: Record<string, string>};
const picksOf = (choices: Picked[], key: string) => choices.find(choice => choice.key === key)?.picks;
const shapes = (choices: Picked[]) => choices.map(choice => [choice.key,choice.picks,choice.pickLabels]);

describe("board-pick metadata", () => {
  it("projectile directions are arrows at the caster, even where the flight holds no location", () => {
    const state = setup({"2,1":[unit("Ogre Goons","goon")]});
    const fireball = getSpellChoices(state,"p1","Fireball");
    expect(shapes(fireball.filter(choice => ["p1/N","p1/S"].includes(choice.key)))).toEqual([["p1/N",["dir:2,3:N"],{"dir:2,3:N":"North"}],["p1/S",["dir:2,3:S"],{"dir:2,3:S":"South"}]]);
    expect(fireball.find(choice => choice.key === "p1/N")?.projectile?.decisions[0].options).toEqual([{key:"goon",label:"Ogre Goons (enemy) at Tile #8",at:"unit:perm:goon"}]);
    expect(picksOf(getSpellChoices(state,"p1","Ice Lance"),"p1/N")).toEqual(["dir:2,3:N"]);
    expect(picksOf(getSpellChoices(state,"p1","Cone of Flame"),"p1/W")).toEqual(["dir:2,3:W"]);
  });
  it("Chain Lightning picks its first link's card; each option is a card, stopping a button at the last link", () => {
    const state = setup({"2,2":[unit("Ogre Goons","g1")],"3,2":[unit("Ogre Goons","g2")]});
    const chain = getSpellChoices(state,"p1","Chain Lightning").find(choice => choice.key === "p1/chain:g1");
    expect(chain?.picks).toEqual(["unit:perm:g1"]);
    expect(chain?.pickLabels).toEqual({"opt:2,2:stop":"Stop the chain"});
    expect(chain?.projectile?.decisions[0].options.map(option => [option.key,option.at])).toEqual([["stop","opt:2,2:stop"],["g2","unit:perm:g2"],["p1","unit:avatar:p1"]]);
  });
  it("gives every decision option its own card, also when units share a tile", () => {
    const optionTokens = (options: {key: string; at?: string}[] | undefined) => options?.map(option => [option.key,option.at]);
    const pair = setup({"2,1":[unit("Ogre Goons","goons"),unit("Cave Trolls","trolls")]});
    expect(optionTokens(getSpellChoices(pair,"p1","Fireball").find(choice => choice.key === "p1/N")?.projectile?.decisions[0].options)).toEqual([["goons","unit:perm:goons"],["trolls","unit:perm:trolls"]]);
    const chain = setup({"2,2":[unit("Ogre Goons","g1")],"3,2":[unit("Cave Trolls","t1"),unit("Pit Vipers","v1")]});
    expect(optionTokens(getSpellChoices(chain,"p1","Chain Lightning").find(choice => choice.key === "p1/chain:g1")?.projectile?.decisions[0].options)).toEqual([["stop","opt:2,2:stop"],["t1","unit:perm:t1"],["v1","unit:perm:v1"],["p1","unit:avatar:p1"]]);
  });
  it("Thunderstorm picks any tile it covers to stay, or a tile only the moved storm covers", () => {
    const state = setup({"1,1":[unit("Thunderstorm","storm",1)]});
    const choices = getSpellChoices({...state,pendingMagic:pending(card("Thunderstorm","storm"),{kind:"auraEnd",source:{kind:"permanent",at:"1,1",index:0,instanceId:"storm"}})},"p1","Thunderstorm");
    expect(choices.map(choice => [choice.key,choice.picks])).toEqual([
      ["storm/1,1",[["1,1","2,1","1,2","2,2"]]],["storm/0,1",[["0,1","0,2"]]],["storm/2,1",[["3,1","3,2"]]],["storm/1,0",[["1,0","2,0"]]],["storm/1,2",[["1,3","2,3"]]],
    ]);
  });
  it("unit spells pick the unit's card, then any destination tile", () => {
    const state = setup({"2,3":[unit("Ogre Goons","ally",1)],"3,1":[unit("Ogre Goons","near"),unit("Cave Trolls","other")]},{"3,2":{owner:2,card:card("Autumn River","river")}});
    expect(picksOf(getSpellChoices(state,"p1","Teleport"),"p1/2,3:p1/0,0")).toEqual(["unit:avatar:p1","0,0"]);
    expect(picksOf(getSpellChoices(state,"p1","Overpower"),"p1/ally")).toEqual(["unit:perm:ally"]);
    expect(picksOf(getSpellChoices(state,"p1","Riptide"),"p1/3,2/3,1:1")).toEqual(["unit:perm:other","3,2"]);
    expect(picksOf(getSpellChoices(state,"p1","Bury"),"p1/3,1/0")).toEqual(["unit:perm:near"]);
    expect(picksOf(getSpellChoices(state,"p1","Cave-In"),"p1/3,1/all")).toEqual(["3,1"]);
    expect(picksOf(getSpellChoices(setup({}),"p1","Divine Healing"),"p1/heal")).toBeUndefined();
  });
  it("Rolling Boulder points an arrow (after the boulder's card when several share the tile); Sinkhole picks the site", () => {
    const state = setup({"1,3":[unit("Ogre Goons","pusher",1),unit("Rolling Boulder","rb",1)]},{"0,3":{owner:1,card:card("Sinkhole","sink")}});
    const choices = abilityChoices(state,"p1");
    expect(shapes(choices.filter(choice => choice.key.startsWith("boulder/pusher/rb/")))).toEqual(["N","E","S","W"].map(dir => [`boulder/pusher/rb/${dir}`,[`dir:1,3:${dir}`],{[`dir:1,3:${dir}`]:{N:"North",E:"East",S:"South",W:"West"}[dir]}]));
    expect(picksOf(choices,"sinkhole/sink/1,2")).toEqual(["1,2"]);
    const two = abilityChoices(setup({"1,3":[unit("Ogre Goons","pusher",1),unit("Rolling Boulder","rb",1),unit("Rolling Boulder","rb2",1)]}),"p1");
    expect(picksOf(two,"boulder/pusher/rb2/E")).toEqual(["unit:perm:rb2","dir:1,3:E"]);
  });
  it("Sunken Treasure picks the water site or a draw split; Genesis minions pick cards, Villages a button", () => {
    const water = {"0,3":{owner:1 as const,card:card("Autumn River","river1")},"4,3":{owner:1 as const,card:card("Autumn River","river2")}};
    const treasure = setup({"2,2":[unit("Sunken Treasure","st",1)]},water);
    const place = getSpellChoices({...treasure,pendingMagic:pending(card("Sunken Treasure"),{kind:"treasurePlace",source:{kind:"permanent",at:"2,2",index:0,instanceId:"st"},castOwner:1})},"p1","Sunken Treasure");
    expect(place.map(choice => [choice.key,choice.picks])).toEqual([["treasure/place/0,3",["0,3"]],["treasure/place/4,3",["4,3"]]]);
    expect(shapes(getSpellChoices({...treasure,pendingMagic:pending(card("Sunken Treasure"),{kind:"drawChoice"})},"p1","Sunken Treasure"))).toEqual([
      ["draw/0",["draw:p1:0-2"],{"draw:p1:0-2":"0 spells, 2 sites"}],["draw/1",["draw:p1:1-1"],{"draw:p1:1-1":"1 spell, 1 site"}],["draw/2",["draw:p1:2-0"],{"draw:p1:2-0":"2 spells, 0 sites"}],
    ]);
    const frog = setup({"2,2":[unit("Brobdingnag Bullfrog","frog",1),unit("Ogre Goons","prey")]});
    const genesis = getSpellChoices({...frog,pendingMagic:pending(card("Brobdingnag Bullfrog","frog"),{kind:"genesis",region:"surface",source:{kind:"permanent",at:"2,2",index:0,instanceId:"frog"}})},"p1","Brobdingnag Bullfrog");
    expect(picksOf(genesis,"genesis/prey")).toEqual(["unit:perm:prey"]);
    const village = setup({},{"2,3":{owner:1,card:card("Humble Village","village")}});
    const offer = getSpellChoices({...village,pendingMagic:pending(card("Humble Village","village"),{kind:"genesis",region:"surface",sourceSite:{at:"2,3",name:"Humble Village",instanceId:"village"}},{spell:{at:"2,3",index:-1,owner:1,card:card("Humble Village","village")}})},"p1","Humble Village");
    expect(shapes(offer)).toEqual([["genesis/soldier",["opt:2,3:soldier"],{"opt:2,3:soldier":"Summon Foot Soldier (1)"}],["genesis/decline",["opt:2,3:decline"],{"opt:2,3:decline":"Skip"}]]);
  });
  it("fight offers are buttons at the fight; random outcomes and Lucky Charm results are cards", () => {
    const state = setup({"2,2":[unit("Ogre Goons","src",1),unit("Raal Dromedary","tgt")]});
    const source = {kind:"permanent" as const,at:"2,2",index:0,instanceId:"src"}, target = {kind:"permanent" as const,at:"2,2",index:1,instanceId:"tgt"};
    expect(shapes(getSpellChoices({...state,pendingMagic:pending(card("Ogre Goons","src"),{kind:"fightChoice",source,target,strikeOnly:true})},"p1","Ogre Goons"))).toEqual([
      ["fight/decline",["opt:2,2:decline"],{"opt:2,2:decline":"Decline"}],["fight/accept",["opt:2,2:accept"],{"opt:2,2:accept":"Strike"}],
    ]);
    const outcomes = [{kind:"damage" as const,targets:[source],amount:3},{kind:"damage" as const,targets:[target],amount:3}];
    expect(getSpellChoices({...state,pendingMagic:pending(card("Lucky Charm"),{kind:"randomChoice",outcomes})},"p1","Lucky Charm").map(choice => [choice.key,choice.picks,choice.card?.instanceId,choice.badge])).toEqual([
      ["random/0",undefined,"src","3 damage"],["random/1",undefined,"tgt","3 damage"],
    ]);
    const raise = {...state,pendingMagic:pending(card("Raise Dead"),undefined,{cpuRandomMinionOptions:[{card:card("Ogre Goons","dead-ogre"),fromSeat:"p2",graveyardIndex:0},{card:card("Pit Vipers","dead-vipers"),fromSeat:"p2",graveyardIndex:1}]})};
    const results = getSpellChoices(raise,"p1","Raise Dead").filter(choice => choice.key.endsWith("/1,0/surface"));
    expect(results.map(choice => [choice.key,choice.picks,choice.pickLabels,choice.card?.name,choice.badge])).toEqual([
      ["p1/outcome-0/1,0/surface",["1,0","opt:1,0:surface"],{"opt:1,0:surface":"Surface"},"Ogre Goons","Result 1"],
      ["p1/outcome-1/1,0/surface",["1,0","opt:1,0:surface"],{"opt:1,0:surface":"Surface"},"Pit Vipers","Result 2"],
    ]);
  });
  it("hand costs pick the hand card; crews and projectiles pick cards", () => {
    const sites = [card("Autumn River","site-a"),card("Red Desert","site-b")];
    expect(getSpellChoices(hand(setup({}),sites),"p1","Craterize").filter(choice => choice.key.startsWith("p1/1,1/")).map(choice => [choice.key,choice.picks])).toEqual([
      ["p1/1,1/site-a",["1,1","hand:p1:site-a"]],["p1/1,1/site-b",["1,1","hand:p1:site-b"]],
    ]);
    const jinn = hand(setup({"2,2":[unit("Nimbus Jinn","jinn",1),unit("Ogre Goons","victim")]}),[card("Fireball","spell-a"),...sites]);
    expect(abilityChoices(jinn,"p1").filter(choice => choice.key.startsWith("jinn/")).map(choice => [choice.key,choice.picks])).toEqual([["jinn/jinn/spell-a",["hand:p1:spell-a"]]]);
    const crew = (artifact: "Payload Trebuchet" | "Siege Ballista") => hand(setup({"2,3":[unit("Ogre Goons","bearer",1),unit("Raal Dromedary","crew",1),{...unit(artifact,"weapon",1),attachedTo:{at:"2,3",index:0},isCarried:true}],"2,2":[unit("Mountain Giant","giant")]}),[card("Fireball","spell-a")]);
    expect(picksOf(abilityChoices(crew("Payload Trebuchet"),"p1"),"trebuchet/bearer/crew/spell-a/2,2")).toEqual(["2,2","unit:perm:crew","hand:p1:spell-a"]);
    expect(picksOf(abilityChoices(crew("Siege Ballista"),"p1"),"ballista/bearer/p1/giant")).toEqual(["unit:avatar:p1","unit:perm:giant"]);
    expect(picksOf(abilityChoices(setup({"2,2":[unit("Pudge Butcher","pudge",1)],"2,0":[unit("Raal Dromedary","far")]}),"p1"),"pudge/pudge/N/far")).toEqual(["unit:perm:far"]);
    // A unit on Pudge's own location stops the projectile in every direction: its card, then an arrow.
    const pudge = abilityChoices(setup({"2,2":[unit("Pudge Butcher","pudge",1),unit("Ogre Goons","here")],"2,0":[unit("Raal Dromedary","far")]}),"p1");
    expect(shapes(pudge.filter(choice => choice.key.startsWith("pudge/pudge/E/here")))).toEqual([["pudge/pudge/E/here",["unit:perm:here","dir:2,2:E"],{"dir:2,2:E":"East"}]]);
  });
});

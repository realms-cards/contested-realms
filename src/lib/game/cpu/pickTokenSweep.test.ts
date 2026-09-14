import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import cards from "@/lib/game/cpu/cards.json";
import { parsePickToken } from "@/lib/game/cpu/pickTokens";
import type { SpellChoice, UnitTarget } from "@/lib/game/cpu/spellTypes";
import { getSpellChoices, projectileKey } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PendingMagic, PermanentItem, PlayerKey, SiteTile, Zones } from "@/lib/game/store/types";

// Every choice list a generator yields must be separable by clicking pick tokens (board cards, tiles, hand cards,
// arrows, piles, anchored buttons) or by a card row (`card`), never only from a text list.

type Choice = SpellChoice & {source?: {at: string; card: CardRef}};
type Scenario = {
  name: string; state: GameState; spell?: string;
  /** Deck-order choices, arranged on the cards themselves (CpuCardOrder), carry no picks and no card. */
  cardOrder?: boolean;
  min?: number;
};

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, id: string, owner: 1 | 2 = 2): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
const perm = (at: string, index: number, instanceId: string): UnitTarget => ({kind:"permanent",at,index,instanceId});

/** 5x4 board of Lone Towers (p1 owns the home row), p1 Flamecaller at 2,3, p2 Geomancer at 4,0. */
function board(permanents: GameState["permanents"], sites: Record<string, SiteTile> = {}, zones: Partial<Record<PlayerKey, Partial<Zones>>> = {}): GameState {
  const store = createGameStore();
  store.setState({actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    board:{size:{w:5,h:4},sites:{...Object.fromEntries(Array.from({length:20},(_,i) => [`${i%5},${Math.floor(i/5)}`,{owner:Math.floor(i/5) === 3 ? 1 : 2,card:card("Lone Tower",`site${i}`)}])),...sites}},
    avatars:{p1:{card:card("Flamecaller","av1"),pos:[2,3],tapped:false},p2:{card:card("Geomancer","av2"),pos:[4,0],tapped:false}},permanents,permanentPositions:{},
  } as Partial<GameState>);
  const state = store.getState();
  return {...state,zones:{p1:{...state.zones.p1,...zones.p1},p2:{...state.zones.p2,...zones.p2}}};
}
function withPending(state: GameState, spell: CardRef, at: string, cpuEvent?: PendingMagic["cpuEvent"], extra: Partial<PendingMagic> = {}): GameState {
  const [x,y] = at.split(",").map(Number);
  return {...state,pendingMagic:{id:"sweep",tile:{x,y},spell:{at,index:-1,owner:1,card:spell},...(cpuEvent ? {cpuEvent} : {}),status:"choosingTarget",createdAt:0,...extra}};
}

const river = (id: string): SiteTile => ({owner:2,card:card("Autumn River",id)});
const crowd = board({"2,2":[unit("Ogre Goons","e1"),unit("Cave Trolls","e2")],"2,1":[unit("Pit Vipers","e3")],"3,3":[unit("Raal Dromedary","ally",1)],"3,2":[unit("Ogre Goons","e4"),unit("Pit Vipers","e5")]});
const spells = (state: GameState, names: string[], extra: Partial<Scenario> = {}) => names.map(spell => ({name:spell,state,spell,...extra}));
const subsurface = board({"1,2":[unit("Ogre Goons","b1"),unit("Cave Trolls","b2"),unit("Lucky Charm","charm")],"3,2":[unit("Ogre Goons","d1"),unit("Pit Vipers","d2"),unit("Rolling Boulder","rock")]},{"3,2":river("water")});
const heatRay = {kind:"projectileStep" as const,name:"Heat Ray" as const,seat:"p1" as const,origin:"2,3",region:"surface",direction:"N" as const,step:0,shot:0};
const fighters = board({"2,2":[unit("Ogre Goons","src",1),unit("Raal Dromedary","tgt")]});
const crewed = (artifact: "Payload Trebuchet" | "Siege Ballista") => board({
  "2,3":[unit("Ogre Goons","bearer",1),unit("Raal Dromedary","crew1",1),unit("Pit Vipers","crew2",1),{...unit(artifact,"weapon",1),attachedTo:{at:"2,3",index:0},isCarried:true}],
  "2,2":[unit("Mountain Giant","giant"),unit("Cave Trolls","trolls")],"2,1":[unit("Ogre Goons","goons")],
},{},{p1:{hand:[card("Fireball","spell-a"),card("Autumn River","site-a")]}});

const SCENARIOS: Scenario[] = [
  {name:"Humble Village Genesis",spell:"Humble Village",state:withPending(board({},{"2,3":{owner:1,card:card("Humble Village","village")}}),card("Humble Village","village"),"2,3",{kind:"genesis",region:"surface",sourceSite:{at:"2,3",name:"Humble Village",instanceId:"village"}})},
  {name:"Brobdingnag Bullfrog Genesis",spell:"Brobdingnag Bullfrog",state:withPending(board({"2,2":[unit("Brobdingnag Bullfrog","frog",1),unit("Ogre Goons","prey"),unit("Cave Trolls","prey2")]}),card("Brobdingnag Bullfrog","frog"),"2,2",{kind:"genesis",region:"surface",source:perm("2,2",0,"frog")})},
  {name:"Clamor of Harpies Genesis",spell:"Clamor of Harpies",state:withPending(board({"2,2":[unit("Clamor of Harpies","harpies",1)],"1,1":[unit("Pit Vipers","v1"),unit("Raal Dromedary","r1")]}),card("Clamor of Harpies","harpies"),"2,2",{kind:"genesis",region:"surface",source:perm("2,2",0,"harpies")})},
  {name:"Undertow Genesis",spell:"Undertow",state:withPending(board({"1,1":[unit("Ogre Goons","u1",1),unit("Cave Trolls","u2")]},{"1,1":{owner:1,card:card("Undertow","undertow")},"2,1":river("r1"),"1,2":river("r2")}),card("Undertow","undertow"),"1,1",{kind:"genesis",region:"surface",sourceSite:{at:"1,1",name:"Undertow",instanceId:"undertow"}})},
  {name:"Red Desert Genesis",spell:"Red Desert",state:withPending(board({"2,2":[unit("Ogre Goons","m1")]},{"1,3":{owner:1,card:card("Red Desert","desert")}}),card("Red Desert","desert"),"1,3",{kind:"genesis",region:"surface",sourceSite:{at:"1,3",name:"Red Desert",instanceId:"desert"}})},
  {name:"Observatory Genesis",spell:"Observatory",cardOrder:true,state:withPending(board({},{"2,3":{owner:1,card:card("Observatory","obs")}},{p1:{spellbook:[card("Fireball","s1"),card("Blink","s2"),card("Heat Ray","s3")]}}),card("Observatory","obs"),"2,3",{kind:"genesis",region:"surface",sourceSite:{at:"2,3",name:"Observatory",instanceId:"obs"}})},
  {name:"Autumn River Genesis",spell:"Autumn River",cardOrder:true,state:withPending(board({},{"2,3":{owner:1,card:card("Autumn River","ar")}},{p1:{spellbook:[card("Fireball","s1")]}}),card("Autumn River","ar"),"2,3",{kind:"genesis",region:"surface",sourceSite:{at:"2,3",name:"Autumn River",instanceId:"ar"}})},
  ...spells(board({"2,3":[unit("Ogre Goons","a1",1),unit("Raal Dromedary","a2",1)]}),["Overpower","Mad Dash","Blaze","Teleport","Blink"]),
  ...spells(subsurface,["Bury","Drown"]),
  // One area per location: a single flooded or dry location with occupants.
  ...spells(subsurface,["Cave-In","Stormy Seas"],{min:1}),
  ...spells(board({"3,1":[unit("Ogre Goons","r1"),unit("Cave Trolls","r2")],"2,2":[unit("Raal Dromedary","r3")]},{"3,2":river("water")}),["Riptide"]),
  ...spells(crowd,["Fireball","Firebolts","Heat Ray","Ice Lance","Cone of Flame","Chain Lightning","Lightning Bolt","Minor Explosion","Incinerate","Major Explosion"]),
  ...spells(board({"2,2":[unit("Ogre Goons","e1")]},{},{p1:{hand:[card("Autumn River","h1"),card("Red Desert","h2"),card("Ogre Goons","h3")]}}),["Craterize"]),
  {name:"Raise Dead",spell:"Raise Dead",state:withPending(board({},{"3,2":river("water")}),card("Raise Dead"),"2,3",undefined,{cpuRandomMinion:{card:card("Ogre Goons","dead"),fromSeat:"p2",graveyardIndex:0}})},
  {name:"Raise Dead with Lucky Charm",spell:"Raise Dead",state:withPending(board({},{"3,2":river("water")}),card("Raise Dead"),"2,3",undefined,{cpuRandomMinionOptions:[{card:card("Ogre Goons","dead-ogre"),fromSeat:"p2",graveyardIndex:0},{card:card("Diluvian Kraken","dead-kraken"),fromSeat:"p2",graveyardIndex:1}]})},
  {name:"projectile impact",spell:"Heat Ray",state:withPending(board({"2,2":[unit("Ogre Goons","i1"),unit("Cave Trolls","i2")]}),card("Heat Ray"),"2,3",{kind:"projectileImpact",projectile:heatRay})},
  {name:"Sunken Treasure draw",spell:"Sunken Treasure",state:withPending(board({}),card("Sunken Treasure"),"2,3",{kind:"drawChoice"})},
  {name:"Sunken Treasure placement",spell:"Sunken Treasure",state:withPending(board({"2,2":[unit("Sunken Treasure","st",1)]},{"0,3":{owner:1,card:card("Autumn River","w1")},"4,3":{owner:1,card:card("Autumn River","w2")}}),card("Sunken Treasure"),"2,2",{kind:"treasurePlace",source:perm("2,2",0,"st"),castOwner:1})},
  {name:"fight offer",spell:"Ogre Goons",state:withPending(fighters,card("Ogre Goons","src"),"2,2",{kind:"fightChoice",source:perm("2,2",0,"src"),target:perm("2,2",1,"tgt")})},
  {name:"strike offer",spell:"Ogre Goons",state:withPending(fighters,card("Ogre Goons","src"),"2,2",{kind:"fightChoice",source:perm("2,2",0,"src"),target:perm("2,2",1,"tgt"),strikeOnly:true})},
  {name:"Lucky Charm random outcome",spell:"Lucky Charm",state:withPending(fighters,card("Lucky Charm"),"2,3",{kind:"randomChoice",outcomes:[{kind:"damage",targets:[perm("2,2",0,"src")],amount:3},{kind:"damage",targets:[perm("2,2",1,"tgt")],amount:3}]})},
  {name:"Colicky Dragonettes end of turn",spell:"Colicky Dragonettes",state:withPending(board({"2,2":[unit("Colicky Dragonettes","drag",1)],"2,0":[unit("Ogre Goons","x")]}),card("Colicky Dragonettes","drag"),"2,2",{kind:"unitEnd",source:perm("2,2",0,"drag"),endKey:"3:1"})},
  {name:"Blaze trail",spell:"Raal Dromedary",min:1,state:withPending(board({"0,0":[{...unit("Raal Dromedary","runner",1),cpuTurnEffect:{turn:"3:1",power:0,movement:2,blaze:true}}],"1,0":[unit("Ogre Goons","east")],"0,1":[unit("Ogre Goons","south")]}),card("Raal Dromedary","runner"),"0,0",{kind:"blazeTrail",from:"0,0",to:"1,1",region:"surface",source:perm("0,0",0,"runner"),budget:3})},
  {name:"Thunderstorm",spell:"Thunderstorm",state:withPending(board({"1,1":[unit("Thunderstorm","storm",1)]}),card("Thunderstorm","storm"),"1,1",{kind:"auraEnd",source:perm("1,1",0,"storm")})},
  {name:"Nimbus Jinn",state:board({"2,2":[unit("Nimbus Jinn","jinn",1),unit("Ogre Goons","victim")]},{},{p1:{hand:[card("Fireball","s1"),card("Blink","s2"),card("Autumn River","site")]}})},
  {name:"Payload Trebuchet",state:crewed("Payload Trebuchet")},
  {name:"Siege Ballista",state:crewed("Siege Ballista")},
  {name:"Pudge Butcher and Flamecaller",state:board({"2,2":[unit("Pudge Butcher","pudge",1),unit("Ogre Goons","here")],"2,0":[unit("Raal Dromedary","far1"),unit("Pit Vipers","far2")],"2,3":[unit("Cave Trolls","adjacent")]},{},{p1:{graveyard:[card("Ogre Goons","dead-fire")]}})},
  {name:"Rolling Boulders and Sinkhole",state:board({"1,3":[unit("Ogre Goons","pusher",1),unit("Rolling Boulder","rb1",1),unit("Rolling Boulder","rb2",1)]},{"0,3":{owner:1,card:card("Sinkhole","sink")}})},
];

const run = (scenario: Scenario, generators: {getSpellChoices: typeof getSpellChoices; abilityChoices: typeof abilityChoices}): Choice[] =>
  scenario.spell ? generators.getSpellChoices(scenario.state,"p1",scenario.spell) : generators.abilityChoices(scenario.state,"p1");

/** Everything that would force a text list: clashing or missing click paths, option tokens, unlabelled buttons and arrows. */
function listOnly(choices: Choice[], scenario: Scenario): string[] {
  const problems: string[] = [];
  const groups = new Map<string, Choice[]>();
  // The UI picks the caster (spells) or the source (abilities) before any pick.
  for (const choice of choices) {
    const id = choice.source ? `${choice.source.card.instanceId || choice.source.card.name}@${choice.source.at}` : JSON.stringify(choice.caster);
    groups.set(id,[...(groups.get(id) ?? []),choice]);
  }
  for (const [id,group] of groups) {
    const paths = new Map<string, string>();
    if (scenario.cardOrder) continue;
    for (const choice of group) {
      // A card row entry (`card`) is its own click, taken before any picks (Lucky Charm results share their tiles).
      const clickPath = JSON.stringify([choice.card?.instanceId ?? null,choice.picks ?? []]);
      const clash = paths.get(clickPath);
      if (clash) problems.push(`${id}: ${clash} and ${choice.key} share the click path ${clickPath}`);
      paths.set(clickPath,choice.key);
      if (group.length > 1 && !choice.picks?.length && !choice.card) problems.push(`${id}: ${choice.key} has neither picks nor a card among ${group.length} choices`);
    }
  }
  for (const choice of choices) {
    const tokens = (choice.picks ?? []).flat();
    for (const decision of choice.projectile?.decisions ?? []) {
      const ats = decision.options.map(option => option.at);
      if (ats.some(at => !at)) problems.push(`${choice.key}: an option of "${decision.label}" has no token`);
      if (new Set(ats).size !== ats.length) problems.push(`${choice.key}: options of "${decision.label}" share a token`);
      tokens.push(...ats.filter((at): at is string => !!at));
    }
    for (const token of tokens) {
      const parsed = parsePickToken(token);
      if (!parsed) problems.push(`${choice.key}: unknown token ${token}`);
      else if (["opt","dir","pile","draw"].includes(parsed.kind) && !choice.pickLabels?.[token]) problems.push(`${choice.key}: no label for ${token}`);
    }
  }
  return problems;
}

describe("pick token sweep", () => {
  it.each(SCENARIOS.map(scenario => [scenario.name,scenario] as const))("%s is separable by clicks", (_name,scenario) => {
    const choices = run(scenario,{getSpellChoices,abilityChoices});
    expect(choices.length).toBeGreaterThanOrEqual(scenario.min ?? 2);
    expect(listOnly(choices,scenario)).toEqual([]);
  });
});

/** The parts of a choice the bot and the confirm step match on; board-pick metadata is left out. */
function rules(choices: Choice[]) {
  return choices.map(({key,label,operations,resolutionOperations,score,caster,target,autoResolve,projectile,source}) => ({key,label,operations,resolutionOperations,score,caster,target,autoResolve,source,
    projectile:projectile && {baseKey:projectile.baseKey,selections:projectile.selections,decisions:projectile.decisions.map(decision => ({label:decision.label,options:decision.options.map(option => ({key:option.key,label:option.label}))}))}}));
}

// Pass CPU_TOKENS_BASELINE=<copy of src/lib/game/cpu from before the pick-token change> to compare against it.
const BASELINE = process.env.CPU_TOKENS_BASELINE;
describe.skipIf(!BASELINE)("pick tokens leave rules untouched", () => {
  const load = createRequire(import.meta.url);
  // A skipped describe still runs this body while collecting, so only load the copy when one was given.
  const baseline = BASELINE ? {
    getSpellChoices:(load(path.join(BASELINE,"spells.js")) as {getSpellChoices: typeof getSpellChoices}).getSpellChoices,
    abilityChoices:(load(path.join(BASELINE,"abilities.js")) as {abilityChoices: typeof abilityChoices}).abilityChoices,
  } : {getSpellChoices,abilityChoices};
  const names = [...new Set(SCENARIOS.flatMap(scenario => scenario.spell ? [scenario.spell] : []))];
  it.each(SCENARIOS.map(scenario => [scenario.name,scenario] as const))("%s: keys, labels, operations and scores match the baseline", (_name,scenario) => {
    const current = {getSpellChoices,abilityChoices};
    const variants = [scenario,...names.map(spell => ({...scenario,spell})),{...scenario,spell:undefined}];
    for (const variant of variants) {
      const now = run(variant,current);
      expect(rules(now)).toEqual(rules(run(variant,baseline)));
      // Re-planned projectile choices (a different option in each decision) follow the same path.
      if (!variant.spell) continue;
      for (const choice of now) for (const [index,decision] of (choice.projectile?.decisions ?? []).entries()) for (const option of decision.options) {
        const selections = [...(choice.projectile?.selections ?? [])];
        selections[index] = option.key;
        const key = projectileKey(choice.projectile?.baseKey ?? "",selections.slice(0,index+1));
        expect(rules(current.getSpellChoices(variant.state,"p1",variant.spell,key))).toEqual(rules(baseline.getSpellChoices(variant.state,"p1",variant.spell,key)));
      }
    }
  });
});

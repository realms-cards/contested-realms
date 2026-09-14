import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import cards from "@/lib/game/cpu/cards.json";
import { useCpuReveals } from "@/lib/game/cpu/revealQueue";
import { getSpellChoices } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PendingMagic, PermanentItem } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, owner: 1 | 2, id: string): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
const reveals = () => useCpuReveals.getState().queue;
const settle = async () => { for (let i=0;i<6;i++) await Promise.resolve(); };

/** The initial state arrives with the match id, so its sites queue no Genesis. */
function setup(overrides: Partial<GameState> = {}) {
  const store = createGameStore();
  const {zones} = store.getState();
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",matchId:"reveal-test",transport:new LocalTransport(),phase:"Main",currentPlayer:2,turn:3,
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Lone Tower","home1")},"2,0":{owner:2,card:card("Lone Tower","home2")}}},permanents:{},
    avatars:{p1:{card:card("Flamecaller","a1"),pos:[2,3],tapped:false},p2:{card:card("Flamecaller","a2"),pos:[2,0],tapped:false}},
    zones:{...zones,p1:{...zones.p1,hand:[card("Lone Tower","my-site"),card("Ogre Goons","my-goons")]},p2:{...zones.p2,hand:[card("Lone Tower","cpu-site"),card("Ogre Goons","cpu-goons")]}},
    ...overrides,
  } as Partial<GameState>);
  return store;
}
type TestStore = ReturnType<typeof setup>;
/** Moves a card from a seat's hand onto a tile in one update, like an applied play patch. */
function playFromHand(store: TestStore, seat: "p1" | "p2", id: string, at: string, extra: Partial<GameState> = {}) {
  const state = store.getState();
  const played = state.zones[seat].hand.find(item => item.instanceId === id);
  if (!played) throw new Error(`no ${id} in hand`);
  const zones = {...state.zones,[seat]:{...state.zones[seat],hand:state.zones[seat].hand.filter(item => item.instanceId !== id)}};
  const owner = seat === "p1" ? 1 : 2;
  if (played.type === "Site") store.setState({zones,board:{...state.board,sites:{...state.board.sites,[at]:{owner,card:played}}},...extra});
  else store.setState({zones,permanents:{...state.permanents,[at]:[...(state.permanents[at] || []),{owner,card:played,instanceId:id,tapped:false}]},...extra});
}

beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); useCpuReveals.getState().reset(); useCpuReveals.getState().setHidden(false); });
afterEach(() => { useCpuReveals.getState().reset(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("CPU play reveals from the board", () => {
  it("reveals a site and a minion the CPU plays from its hand", () => {
    const store = setup();
    playFromHand(store,"p2","cpu-site","1,0");
    expect(reveals()[0]).toMatchObject({id:"cpu_play_cpu-site",seat:"p2",kind:"site",action:"plays at Tile #2"});
    expect(reveals()[0].card.name).toBe("Lone Tower");
    playFromHand(store,"p2","cpu-goons","2,1");
    expect(reveals().find(item => item.kind === "permanent")).toMatchObject({id:"cpu_play_cpu-goons",seat:"p2",action:"summons at Tile #8"});
  });

  it("never reveals the human's own plays or cards placed by effects", () => {
    const store = setup();
    playFromHand(store,"p1","my-site","1,3");
    playFromHand(store,"p1","my-goons","1,2");
    // A CPU unit that did not come from its hand (a summon or raise).
    store.setState({permanents:{...store.getState().permanents,"3,0":[unit("Mountain Giant",2,"summoned")]}});
    // A card moving between tiles is not a new play.
    store.setState({permanents:{"3,1":[unit("Mountain Giant",2,"summoned")]}});
    expect(reveals()).toEqual([]);
  });

  it("ignores snapshot restores", () => {
    const store = setup();
    playFromHand(store,"p2","cpu-goons","2,1",{cpuSnapshotRevision:(store.getState().cpuSnapshotRevision || 0)+1});
    playFromHand(store,"p2","cpu-site","1,0",{cpuSnapshotRevision:(store.getState().cpuSnapshotRevision || 0)+2});
    expect(reveals()).toEqual([]);
  });

  it("clears reveals when the match changes", () => {
    const store = setup();
    playFromHand(store,"p2","cpu-goons","2,1");
    expect(reveals()).toHaveLength(1);
    store.setState({matchId:"next-match"});
    expect(reveals()).toEqual([]);
  });
});

describe("CPU effect reveals", () => {
  const boltCast = (owner: 1 | 2, playerKey: "p1" | "p2", id = "cpu-bolt") => ({type:"magicBegin",id,tile:{x:2,y:0},spell:{at:"2,0",index:-1,owner,instanceId:"bolt",card:card("Lightning Bolt","bolt")},playerKey});

  it("opens a spell at magicBegin and fills its effect from the CPU's announced choice", () => {
    const store = setup();
    store.setState({permanents:{"2,1":[unit("Ogre Goons",1,"target")]}});
    store.getState().receiveCustomMessage(boltCast(2,"p2"));
    expect(reveals()).toEqual([expect.objectContaining({id:"cpu-bolt",seat:"p2",kind:"spell",action:"casts",detail:null})]);
    const choice = getSpellChoices(store.getState(),"p2","Lightning Bolt")[0];
    expect(choice).toBeTruthy();
    store.getState().receiveCustomMessage({type:"cpuMagicChoice",id:"cpu-bolt",key:choice.key,playerKey:"p2"});
    expect(reveals()).toHaveLength(1);
    expect(reveals()[0].detail).toBe(choice.label);
  });

  it("does not reveal the human's spells", () => {
    const store = setup();
    store.getState().receiveCustomMessage(boltCast(1,"p1","mine"));
    store.getState().receiveCustomMessage(boltCast(1,"p2","mismatch"));
    expect(reveals()).toEqual([]);
  });

  it("waits to auto-resolve a CPU spell until its reveal has been readable, with a bounded wait", () => {
    vi.useFakeTimers();
    const store = setup();
    const resolveMagic = vi.fn();
    store.setState({resolveMagic});
    useCpuReveals.getState().show({id:"earlier",seat:"p2",card:card("Ogre Goons"),kind:"permanent",action:"summons at Tile #8"});
    store.getState().receiveCustomMessage(boltCast(2,"p2"));
    store.getState().receiveCustomMessage({type:"magicConfirm",id:"cpu-bolt",playerKey:"p2"});
    vi.advanceTimersByTime(1000);
    expect(resolveMagic).not.toHaveBeenCalled();
    useCpuReveals.getState().dismiss("earlier");
    vi.advanceTimersByTime(1400);
    expect(resolveMagic).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(resolveMagic).toHaveBeenCalledTimes(1);

    const stuck = setup();
    const stuckResolve = vi.fn();
    stuck.setState({resolveMagic:stuckResolve});
    useCpuReveals.getState().reset();
    useCpuReveals.getState().show({id:"hovered",seat:"p2",card:card("Ogre Goons"),kind:"permanent",action:"summons at Tile #8"});
    useCpuReveals.getState().hold(true);
    stuck.getState().receiveCustomMessage(boltCast(2,"p2","cpu-bolt-2"));
    stuck.getState().receiveCustomMessage({type:"magicConfirm",id:"cpu-bolt-2",playerKey:"p2"});
    vi.advanceTimersByTime(6000);
    expect(stuckResolve).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1100);
    expect(stuckResolve).toHaveBeenCalledTimes(1);
  });

  it("reveals a CPU activated ability with its source card and effect", () => {
    const store = setup({board:{size:{w:5,h:4},sites:{"2,0":{owner:2,card:card("Sinkhole","cpu-sinkhole")},"2,1":{owner:1,card:card("Spring River","river")},"2,3":{owner:1,card:card("Lone Tower","home1")}}}});
    const ability = abilityChoices(store.getState(),"p2")[0];
    expect(ability).toBeTruthy();
    store.getState().receiveCustomMessage({type:"cpuActivateAbility",id:"req-1",key:ability.key,playerKey:"p2"});
    expect(reveals()[0]).toMatchObject({id:"req-1",seat:"p2",kind:"ability",action:"activates",detail:ability.label});
    expect(reveals()[0].card.name).toBe("Sinkhole");
  });

  it("reveals CPU-owned triggered effects with their resolved label, keeping private choices private", async () => {
    const store = setup();
    const trigger = (owner: 1 | 2, name: keyof typeof cards, id: string): PendingMagic => ({id,tile:{x:2,y:0},spell:{at:"2,0",index:-1,owner,instanceId:id,card:card(name,id)},
      cpuEvent:{kind:"genesis",region:"surface"},status:"confirm",createdAt:0});
    store.getState().finishCpuEffect({pending:trigger(2,"Arid Desert","cpu-genesis"),label:"Deal 1 damage to Ogre Goons"});
    store.getState().finishCpuEffect({pending:trigger(2,"Observatory","cpu-observatory"),label:"Put Lone Tower on top"});
    store.getState().finishCpuEffect({pending:trigger(1,"Arid Desert","my-genesis"),label:"Deal 1 damage"});
    await settle();
    expect(reveals().map(item => [item.id,item.kind,item.action,item.detail])).toEqual([
      ["cpu-genesis","trigger","Genesis","Deal 1 damage to Ogre Goons"],
      ["cpu-observatory","trigger","Genesis","resolved its private deck choice"],
    ]);
  });
});

import type { StoreApi } from "zustand";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import { hasCpuGenesis } from "@/lib/game/cpu/genesis";
import type { UnitTarget } from "@/lib/game/cpu/spellTypes";
import { cardText, getSpellChoices, inRange, isDisabled, sameTarget, unitsInRealm } from "@/lib/game/cpu/spells";
import { treasures } from "@/lib/game/cpu/treasure";
import type { CardRef, GameState, PendingMagic } from "@/lib/game/store/types";
import type { CustomMessage } from "@/lib/net/transport";

/** The human client adjudicates CPU matches; tabletop stores are untouched. */
export function installCpuController(store: StoreApi<GameState>) {
  const queue: PendingMagic[] = [];
  const batches = new Map<string,number>();
  let nextBatch = 0;
  let endQueued: string | null = null;
  let endRequested: string | null = null;
  const enqueue = (pending: PendingMagic,batch: number) => {
    batches.set(pending.id,batch);
    const first = queue.findIndex(event => batches.get(event.id) === batch);
    if (first<0) {
      if (store.getState().cpuResolvingEffect) queue.unshift(pending);
      else queue.push(pending);
      return;
    }
    const siblings = queue.filter(event => batches.get(event.id) === batch);
    siblings.push(pending);
    const active = store.getState().currentPlayer;
    siblings.sort((a,b) => Number(a.spell.owner === active)-Number(b.spell.owner === active));
    queue.splice(first,siblings.length-1,...siblings);
  };
  const enqueueGenesis = (card: CardRef,at: string,owner: 1 | 2,batch: number,region = "surface",source?: UnitTarget) => {
    if (!hasCpuGenesis(card.name)) return;
    const id = `cpu_genesis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const [x,y] = at.split(",").map(Number);
    enqueue({id,tile:{x,y},spell:{at,index:-1,owner,instanceId:id,card},cpuEvent:{kind:"genesis",region,source,...(card.type === "Site" ? {sourceSite:{at,name:card.name,instanceId:card.instanceId}} : {})},status:"choosingTarget",createdAt:Date.now()},batch);
  };
  let scheduled = false;
  const drain = () => {
    scheduled = false;
    const state = store.getState();
    if (state.pendingMagic || state.pendingCombat || state.matchEnded) return;
    const frames = state.cpuEffectContinuations || [];
    const frame = frames[frames.length-1];
    if (frame && queue.length<=frame.waitingFor) {
      store.setState({cpuEffectContinuations:frames.slice(0,-1)});
      if (applySpellChoice(store.setState,store.getState,frame.choice,Math.random,frame.completion) && frame.completion) store.getState().finishCpuEffect(frame.completion);
      if (!scheduled) { scheduled = true; queueMicrotask(drain); }
      return;
    }
    if (!queue.length) {
      const key = `${state.turn}:${state.currentPlayer}`;
      if (state.phase === "End" && endQueued === key && endRequested !== key) {
        endRequested = key;
        state.flushPendingPatches();
        state.transport?.sendAction({currentPlayer:state.currentPlayer === 1 ? 2 : 1,phase:"Start",cpuEndResolved:key});
      }
      return;
    }
    if (queue.length>1) {
      const owner = queue[0].spell.owner;
      const batch = batches.get(queue[0].id);
      const candidates = queue.filter(pending => batches.get(pending.id) === batch && pending.spell.owner === owner);
      const seat = owner === 1 ? "p1" : "p2";
      if (seat === state.actorKey && candidates.length > 1) {
        const chosen = candidates.find(candidate => candidate.id === state.cpuChosenTrigger);
        if (!chosen) {
          const options = candidates.map(candidate => ({id:candidate.id,label:`${candidate.spell.card.name} — ${candidate.cpuEvent?.kind === "unitEnd" ? "end-of-turn projectile" : candidate.cpuEvent?.kind === "auraEnd" ? candidate.cpuEvent.counter ? "duration counter" : "end effect" : candidate.cpuEvent?.kind === "genesis" ? "Genesis" : candidate.cpuEvent?.kind === "fightChoice" ? "fight after arrival" : candidate.cpuEvent?.kind === "treasureRecover" ? "recover treasure" : candidate.cpuEvent?.kind === "treasurePlace" ? "underwater placement" : candidate.cpuEvent?.kind === "drawChoice" ? "choose draws" : candidate.cpuEvent?.kind === "randomChoice" ? "choose random outcome" : "fire trail"}`}));
          if (JSON.stringify(state.cpuTriggerOptions) !== JSON.stringify(options)) store.setState({cpuTriggerOptions:options});
          return;
        }
        queue.splice(queue.indexOf(chosen),1);
        queue.unshift(chosen);
      }
    }
    const pending = queue.shift();
    if (!pending) return;
    batches.delete(pending.id);
    store.setState({pendingMagic:pending,cpuPendingTriggerCount:queue.length,cpuTriggerOptions:[],cpuChosenTrigger:null});
    state.transport?.sendMessage?.({type:"magicBegin",id:pending.id,tile:pending.tile,spell:pending.spell} as unknown as CustomMessage);
    const seat = pending.spell.owner === 1 ? "p1" : "p2";
    if (state.actorKey !== seat) {
      const choice = getSpellChoices(store.getState(),seat,pending.spell.card.name).sort((a,b) => b.score-a.score)[0];
      if (choice) {
        store.setState({pendingMagic:{...pending,cpuChoice:choice.key,status:"confirm"}});
        store.getState().resolveMagic();
      }
    }
  };
  return store.subscribe((state,previous) => {
    const batch = ++nextBatch;
    if (!state.opponentPlayerId?.startsWith("cpu_") || !state.actorKey || !state.matchId || !state.transport || state.phase === "Setup" || state.matchId !== previous.matchId) {
      queue.length = 0;
      batches.clear();
      endQueued = null;
      endRequested = null;
      if (state.cpuEffectContinuations?.length) store.setState({cpuEffectContinuations:[]});
      if (state.cpuPendingTriggerCount || state.cpuTriggerOptions?.length) store.setState({cpuPendingTriggerCount:0,cpuTriggerOptions:[],cpuChosenTrigger:null});
      return;
    }
    const endKey = `${state.turn}:${state.currentPlayer}`;
    const restored = (state.cpuSnapshotRevision || 0) !== (previous.cpuSnapshotRevision || 0);
    // Pure realm scans of this snapshot, shared by the genesis/trail and Stealth checks below.
    let realm: ReturnType<typeof unitsInRealm> | undefined;
    const unitsNow = () => realm ||= unitsInRealm(state);
    if (!restored && (state.permanents !== previous.permanents || state.permanentPositions !== previous.permanentPositions || state.avatars !== previous.avatars)) {
      let before: ReturnType<typeof treasures> | undefined;
      for (const treasure of treasures(state)) {
        const prior = (before ||= treasures(previous)).find(item => sameTarget(item.target,treasure.target));
        const seat = treasure.owner === 1 ? "p1" : "p2";
        const fromHand = !prior && previous.zones[seat].hand.some(card => card.instanceId && card.instanceId === treasure.card.instanceId);
        const recovered = prior?.carried && treasure.carried && prior.region !== "surface" && treasure.region === "surface";
        if (!fromHand && !recovered) continue;
        const id = `cpu_treasure_${Date.now()}_${Math.random().toString(36).slice(2)}`, [x,y] = treasure.at.split(",").map(Number);
        enqueue({id,tile:{x,y},spell:{at:treasure.at,index:-1,owner:fromHand ? treasure.owner === 1 ? 2 : 1 : treasure.owner,card:treasure.card},
          cpuEvent:fromHand ? {kind:"treasurePlace",source:treasure.target,castOwner:treasure.owner} : {kind:"treasureRecover",source:treasure.target},status:"choosingTarget",createdAt:Date.now()},batch);
      }
    }
    if (state.phase === "End" && endQueued !== endKey) {
      endQueued = endKey;
      for (const [at,items] of Object.entries(state.permanents)) items.forEach((item,index) => {
        const name = item.card.name;
        if (name === "Colicky Dragonettes" && item.owner === state.currentPlayer && item.cpuAuraLastEnd?.effect !== endKey) {
          const id = `cpu_dragonettes_${endKey}_${item.instanceId || `${at}_${index}`}`, [x,y] = at.split(",").map(Number);
          enqueue({id,tile:{x,y},spell:{at,index:-1,owner:item.owner,instanceId:id,card:item.card},cpuEvent:{kind:"unitEnd",source:{kind:"permanent",at,index,instanceId:item.instanceId || item.card.instanceId},endKey},status:"choosingTarget",createdAt:Date.now()},batch);
        }
        if (name !== "Wildfire" && !(item.owner === state.currentPlayer && ["Thunderstorm","Entangle Terrain"].includes(name))) return;
        const id = `cpu_aura_${endKey}_${item.instanceId || `${at}_${index}`}`;
        const [x,y] = at.split(",").map(Number);
        if (item.cpuAuraLastEnd?.[name === "Entangle Terrain" ? "counter" : "effect"] !== endKey) enqueue({id,tile:{x,y},spell:{at,index:-1,owner:item.owner,instanceId:id,card:item.card},
          cpuEvent:{kind:"auraEnd",source:{kind:"permanent",at,index,instanceId:item.instanceId || item.card.instanceId}},status:"choosingTarget",createdAt:Date.now()},batch);
        if (name === "Thunderstorm" && item.cpuAuraLastEnd?.counter !== endKey) enqueue({id:`${id}_counter`,tile:{x,y},spell:{at,index:-1,owner:item.owner,instanceId:`${id}_counter`,card:item.card},
          cpuEvent:{kind:"auraEnd",counter:true,source:{kind:"permanent",at,index,instanceId:item.instanceId || item.card.instanceId}},status:"choosingTarget",createdAt:Date.now()},batch);
      });
    }
    if (!restored && (state.permanents !== previous.permanents || state.avatars !== previous.avatars)) {
      const before = unitsInRealm(previous);
      for (const current of unitsNow()) {
        const prior = before.find(u => sameTarget(u.target,current.target));
        if (!prior && current.target.kind === "permanent") enqueueGenesis(current.card,current.at,current.owner === "p1" ? 1 : 2,batch,current.region,current.target);
        if (!prior || (prior.at === current.at && prior.region === current.region)) continue;
        const entity = prior.target.kind === "avatar" ? previous.avatars[prior.target.seat] : previous.permanents[prior.at][prior.target.index];
        if (!entity.cpuTurnEffect?.blaze || entity.cpuTurnEffect.turn !== `${previous.turn}:${previous.currentPlayer}`) continue;
        const id = `cpu_trail_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const [x,y] = current.at.split(",").map(Number);
        enqueue({id,tile:{x,y},spell:{at:current.at,index:-1,owner:current.owner === "p1" ? 1 : 2,instanceId:id,card:current.card},
          cpuEvent:{kind:"blazeTrail",from:prior.at,to:current.at,region:prior.region,source:current.target,forced:state.cpuForcedMovement || prior.region !== current.region},status:"choosingTarget",createdAt:Date.now()},batch);
      }
    }
    if (!restored && state.board !== previous.board) {
      const fills: PendingMagic[] = [];
      for (const [at,tile] of Object.entries(state.board.sites)) {
        const oldCard = previous.board.sites[at]?.card;
        if (!tile.card || (oldCard && oldCard.name === tile.card.name && oldCard.instanceId === tile.card.instanceId)) continue;
        // Moving or transforming an existing site is not entering the realm.
        if (tile.card.instanceId && Object.values(previous.board.sites).some(old => old.card?.instanceId === tile.card?.instanceId)) continue;
        enqueueGenesis(tile.card,at,tile.owner,batch);
        const seat = tile.owner === 1 ? "p1" : "p2";
        const avatar = state.avatars[seat];
        const fromHand = tile.card.instanceId && previous.zones[seat].hand.some(card => card.instanceId === tile.card?.instanceId) && !state.zones[seat].hand.some(card => card.instanceId === tile.card?.instanceId);
        if (fromHand && avatar.card?.name === "Geomancer" && Number(tile.card.thresholds?.earth || 0)>0) {
          const id = `cpu_geomancer_${Date.now()}_${Math.random().toString(36).slice(2)}`, [x,y] = avatar.pos || [0,0];
          fills.push({id,tile:{x,y},spell:{at:`${x},${y}`,index:-1,owner:tile.owner,card:avatar.card},cpuEvent:{kind:"geomancerFill",seat},status:"choosingTarget",createdAt:Date.now()});
        }
      }
      // The remainder of the activated ability follows the site's entry triggers;
      // it is not a simultaneous trigger that can be ordered before Genesis.
      for (const pending of fills) { batches.set(pending.id,++nextBatch); queue.push(pending); }
    }
    if (state.cpuGenesisRequests !== previous.cpuGenesisRequests) {
      for (const request of state.cpuGenesisRequests || []) {
        const tile = state.board.sites[request.at];
        if (tile?.card) enqueueGenesis(tile.card,request.at,tile.owner,batch);
      }
    }
    if (state.cpuEffectRequests !== previous.cpuEffectRequests) {
      for (const pending of state.cpuEffectRequests || []) enqueue(pending,batch);
    }
    if (state.permanents !== previous.permanents) {
      const units = unitsNow(), changes: GameState["permanents"] = {};
      for (const unit of units) {
        if (unit.target.kind !== "permanent" || !/\bStealth\b/.test(cardText(unit.card))) continue;
        const item = state.permanents[unit.at][unit.target.index];
        if (item.cpuStealthLost) continue;
        const revealed = isDisabled(state,unit) || units.some(other => other.card.name === "Scent Hounds" && other.owner !== unit.owner && other.region === unit.region && !isDisabled(state,other) && inRange(unit.at,other.at,"nearby"));
        if (!revealed) continue;
        changes[unit.at] ||= [...state.permanents[unit.at]];
        changes[unit.at][unit.target.index] = {...item,cpuStealthLost:true,version:(item.version || 0)+1};
      }
      if (Object.keys(changes).length) {
        store.setState({permanents:{...store.getState().permanents,...changes}});
        store.getState().trySendPatch({permanents:changes});
      }
    }
    if (store.getState().cpuPendingTriggerCount !== queue.length) store.setState({cpuPendingTriggerCount:queue.length});
    if ((queue.length || state.cpuEffectContinuations?.length || state.phase === "End") && !scheduled) { scheduled = true; queueMicrotask(drain); }
  });
}

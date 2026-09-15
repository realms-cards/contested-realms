import type { StoreApi } from "zustand";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import { cornerOf, hasEndTrigger, hasStartSiteTrigger, hasStartTrigger } from "@/lib/game/cpu/cardTriggers";
import cpuCardData from "@/lib/game/cpu/cards.json";
import { hasCpuDeathrite, hasCpuGenesis } from "@/lib/game/cpu/genesis";
import { movementAllowance, movementRoutes } from "@/lib/game/cpu/movement";
import { useCpuReveals } from "@/lib/game/cpu/revealQueue";
import { CPU_TRIGGERS_IN_ORDER, type TriggerSource, type UnitTarget } from "@/lib/game/cpu/spellTypes";
import { cardText, getSpellChoices, inRange, isDisabled, isWater, sameTarget, unitsInRealm } from "@/lib/game/cpu/spells";
import { treasures } from "@/lib/game/cpu/treasure";
import type { CardRef, GameState, PendingMagic, PlayerKey } from "@/lib/game/store/types";
import { getCellNumber } from "@/lib/game/store/utils/boardHelpers";
import type { CustomMessage } from "@/lib/net/transport";

/** How long the human client waits for the CPU to declare defenders before the attack goes ahead unblocked (the bot's own worst case is about 17 s). */
export const CPU_DEFENDER_TIMEOUT_MS = 20000;

type CardTriggerEvent = Extract<NonNullable<PendingMagic["cpuEvent"]>, {kind: "cardTrigger"}>;
const TRIGGER_BADGES: Record<CardTriggerEvent["trigger"], string> = {
  start:"start of turn",end:"end of turn",corner:"corner reached",curse:"Mariner's Curse",kiteStep:"step after shooting",skirmish:"ranged strike on the move",
};
const CARD_SUBTYPES = cpuCardData as unknown as Record<string, {subTypes?: string}>;

/** The human client adjudicates CPU matches; tabletop stores are untouched. */
export function installCpuController(store: StoreApi<GameState>) {
  const queue: PendingMagic[] = [];
  const batches = new Map<string,number>();
  let nextBatch = 0;
  let endQueued: string | null = null;
  let endRequested: string | null = null;
  let startScanned: string | null = null;
  let defenderWait: {id: string; timer: ReturnType<typeof setTimeout>} | null = null;
  const stopDefenderWait = () => { if (defenderWait) clearTimeout(defenderWait.timer); defenderWait = null; };
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
  /** Queue a cardTrigger event once: ids are deterministic, so a re-scan never duplicates a queued or resolving trigger. */
  const enqueueTrigger = (trigger: CardTriggerEvent["trigger"],source: TriggerSource,card: CardRef,at: string,owner: 1 | 2,batch: number,id: string,
    extra: Pick<CardTriggerEvent,"path" | "corner" | "victim"> = {}) => {
    if (queue.some(event => event.id === id) || store.getState().pendingMagic?.id === id) return;
    const [x,y] = at.split(",").map(Number);
    enqueue({id,tile:{x,y},spell:{at,index:-1,owner,instanceId:id,card},cpuEvent:{kind:"cardTrigger",trigger,source,...extra},status:"choosingTarget",createdAt:Date.now()},batch);
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
        const chosen = state.cpuChosenTrigger === CPU_TRIGGERS_IN_ORDER ? candidates[0] : candidates.find(candidate => candidate.id === state.cpuChosenTrigger);
        if (!chosen) {
          // Shown as the triggering cards (all on the board or public: only the actor's own triggers are ordered here), badged with the event.
          const options = candidates.map(candidate => {
            const event = candidate.cpuEvent, {name,slug,cardId,instanceId,type} = candidate.spell.card;
            const badge = event?.kind === "unitEnd" ? "end-of-turn projectile" : event?.kind === "auraEnd" ? event.counter ? "duration counter" : "end effect" : event?.kind === "genesis" ? "Genesis" : event?.kind === "deathrite" ? "Deathrite" : event?.kind === "cardTrigger" ? TRIGGER_BADGES[event.trigger] : event?.kind === "fightChoice" ? "fight after arrival" : event?.kind === "treasureRecover" ? "recover treasure" : event?.kind === "treasurePlace" ? "underwater placement" : event?.kind === "drawChoice" ? "choose draws" : event?.kind === "randomChoice" ? "choose random outcome" : "fire trail";
            return {id:candidate.id,label:`${name} — ${badge}`,card:{name,slug,cardId,instanceId,type},badge};
          });
          if (JSON.stringify(state.cpuTriggerOptions) !== JSON.stringify(options)) store.setState({cpuTriggerOptions:options});
          return;
        }
        queue.splice(queue.indexOf(chosen),1);
        queue.unshift(chosen);
      }
    }
    const pending = queue.shift();
    if (!pending) return;
    const pendingBatch = batches.get(pending.id);
    batches.delete(pending.id);
    // A dismissed list keeps the listed order until its batch is done, instead of asking again.
    const inOrder = state.cpuChosenTrigger === CPU_TRIGGERS_IN_ORDER && queue.some(event => batches.get(event.id) === pendingBatch);
    store.setState({pendingMagic:pending,cpuPendingTriggerCount:queue.length,cpuTriggerOptions:[],cpuChosenTrigger:inOrder ? CPU_TRIGGERS_IN_ORDER : null});
    state.transport?.sendMessage?.({type:"magicBegin",id:pending.id,tile:pending.tile,spell:pending.spell} as unknown as CustomMessage);
    const seat = pending.spell.owner === 1 ? "p1" : "p2";
    const choices = getSpellChoices(store.getState(),seat,pending.spell.card.name);
    // The CPU's events take the best choice; the human's resolve unprompted when nothing is left to decide.
    const choice = state.actorKey !== seat ? choices.sort((a,b) => b.score-a.score)[0]
      : choices.length === 1 && (!choices[0].projectile?.decisions.length || choices[0].autoResolve) ? choices[0] : undefined;
    if (choice) {
      store.setState({pendingMagic:{...pending,cpuChoice:choice.key,status:"confirm"}});
      store.getState().resolveMagic();
    }
  };
  return store.subscribe((state,previous) => {
    const batch = ++nextBatch;
    if (!state.opponentPlayerId?.startsWith("cpu_") || !state.actorKey || !state.matchId || !state.transport || state.phase === "Setup" || state.matchId !== previous.matchId) {
      queue.length = 0;
      batches.clear();
      endQueued = null;
      endRequested = null;
      startScanned = null;
      stopDefenderWait();
      if (state.cpuEffectContinuations?.length) store.setState({cpuEffectContinuations:[]});
      if (state.cpuPendingTriggerCount || state.cpuTriggerOptions?.length) store.setState({cpuPendingTriggerCount:0,cpuTriggerOptions:[],cpuChosenTrigger:null});
      if (useCpuReveals.getState().queue.length) useCpuReveals.getState().reset();
      return;
    }
    const endKey = `${state.turn}:${state.currentPlayer}`;
    const restored = (state.cpuSnapshotRevision || 0) !== (previous.cpuSnapshotRevision || 0);
    // The CPU answers an attack or intercept offer with combatCommit; if it never does (a disconnected or stalled bot),
    // the attack goes ahead unblocked instead of waiting forever.
    const combat = state.pendingCombat, defendingCpu: PlayerKey = state.actorKey === "p1" ? "p2" : "p1";
    const awaiting = combat && combat.defenderSeat === defendingCpu && (combat.status === "declared" || combat.status === "defending") ? combat.id : null;
    if (defenderWait && defenderWait.id !== awaiting) stopDefenderWait();
    if (awaiting && !defenderWait) {
      defenderWait = {id:awaiting,timer:setTimeout(() => {
        defenderWait = null;
        const current = store.getState(), pending = current.pendingCombat;
        if (!pending || pending.id !== awaiting || (pending.status !== "declared" && pending.status !== "defending")) return;
        const commit = {type:"combatCommit",id:pending.id,defenders:[],target:pending.target ?? null,tile:pending.tile,playerKey:defendingCpu,ts:Date.now()} as unknown as CustomMessage;
        current.log("The CPU did not answer in time: the attack goes ahead unblocked");
        current.receiveCustomMessage(commit);
        current.transport?.sendMessage?.(commit);
      },CPU_DEFENDER_TIMEOUT_MS)};
    }
    /** Reveal a card the CPU just played from its hand (never the human's own plays). */
    const revealPlay = (card: CardRef, at: string, seat: PlayerKey, kind: "site" | "permanent") => {
      if (seat === state.actorKey) return;
      const [x,y] = at.split(",").map(Number);
      const verb = kind === "permanent" && (card.type || "").toLowerCase().includes("minion") ? "summons" : "plays";
      useCpuReveals.getState().show({id:`cpu_play_${card.instanceId || `${at}_${card.name}`}`,seat,card,kind,
        action:`${verb} at Tile #${getCellNumber(x,y,state.board.size.w,state.board.size.h)}`});
    };
    if (!restored && state.permanents !== previous.permanents) {
      const cpuSeat: PlayerKey = state.actorKey === "p1" ? "p2" : "p1";
      const inHand = new Set((previous.zones[cpuSeat]?.hand || []).flatMap(card => card.instanceId ? [card.instanceId] : []));
      if (inHand.size) {
        const onBoard = new Set<string>(), stillInHand = new Set((state.zones[cpuSeat]?.hand || []).map(card => card.instanceId));
        for (const items of Object.values(previous.permanents)) for (const item of items || []) if (item.card.instanceId) onBoard.add(item.card.instanceId);
        for (const [at,items] of Object.entries(state.permanents)) for (const item of items || []) {
          const id = item.card.instanceId;
          // Effect-placed cards (not from hand) and Magic (revealed by its cast) are skipped.
          if (!id || !inHand.has(id) || onBoard.has(id) || stillInHand.has(id) || (item.card.type || "").toLowerCase().includes("magic")) continue;
          revealPlay(item.card,at,cpuSeat,"permanent");
        }
      }
    }
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
        const unitId = item.instanceId || item.card.instanceId;
        if (unitId && hasEndTrigger(name) && item.owner === state.currentPlayer && item.cpuTriggerStamps?.end !== endKey) {
          enqueueTrigger("end",{kind:"permanent",at,index,instanceId:unitId},item.card,at,item.owner,batch,`cpu_end_${endKey}_${unitId}`);
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
    // Start-of-turn triggers of the player whose turn began, scanned once per turn once the board is known.
    // Resolving stamps the source, so a reload later in the turn does not repeat a resolved trigger.
    if (!restored && Object.keys(state.board.sites).length && (state.phase === "Start" || state.phase === "Main") && startScanned !== endKey) {
      startScanned = endKey;
      for (const [at,items] of Object.entries(state.permanents)) items.forEach((item,index) => {
        const unitId = item.instanceId || item.card.instanceId;
        if (!unitId || item.owner !== state.currentPlayer || !hasStartTrigger(item.card.name) || item.cpuTriggerStamps?.start === endKey) return;
        enqueueTrigger("start",{kind:"permanent",at,index,instanceId:unitId},item.card,at,item.owner,batch,`cpu_start_${endKey}_${unitId}`);
      });
      for (const [at,tile] of Object.entries(state.board.sites)) {
        if (!tile.card || tile.owner !== state.currentPlayer || !hasStartSiteTrigger(tile.card.name) || tile.cpuTriggerStamps?.start === endKey) continue;
        enqueueTrigger("start",{kind:"site",at,instanceId:tile.card.instanceId},tile.card,at,tile.owner,batch,`cpu_start_${endKey}_${tile.card.instanceId || at}`);
      }
    }
    if (!restored && (state.permanents !== previous.permanents || state.avatars !== previous.avatars)) {
      const before = unitsInRealm(previous);
      // Deathrite: a unit that left the realm for its owner's cemetery triggers where it died.
      for (const prior of before) {
        const id = prior.card.instanceId;
        if (prior.target.kind !== "permanent" || !id || !hasCpuDeathrite(prior.card.name) || unitsNow().some(u => sameTarget(u.target,prior.target))) continue;
        if (!state.zones[prior.owner]?.graveyard.some(card => card.instanceId === id) || previous.zones[prior.owner]?.graveyard.some(card => card.instanceId === id)) continue;
        const eventId = `cpu_deathrite_${id}_${Date.now()}`, [x,y] = prior.at.split(",").map(Number);
        enqueue({id:eventId,tile:{x,y},spell:{at:prior.at,index:-1,owner:prior.owner === "p1" ? 1 : 2,instanceId:eventId,card:prior.card},
          cpuEvent:{kind:"deathrite",region:prior.region},status:"choosingTarget",createdAt:Date.now()},batch);
      }
      for (const current of unitsNow()) {
        const prior = before.find(u => sameTarget(u.target,current.target));
        if (!prior && current.target.kind === "permanent") enqueueGenesis(current.card,current.at,current.owner === "p1" ? 1 : 2,batch,current.region,current.target);
        const unitId = current.target.kind === "permanent" ? current.target.instanceId : null;
        if (unitId && current.target.kind === "permanent" && (!prior || prior.at !== current.at) && (current.card.type || "").toLowerCase() !== "artifact") {
          const item = state.permanents[current.at]?.[current.target.index];
          // Wayfaring Pilgrim: the first entry into each corner (summoned into one counts) offers a draw.
          const corner = cornerOf(current.at,state.board.size);
          if (item && corner && current.card.name === "Wayfaring Pilgrim" && !(item.cpuCornersVisited || []).includes(corner)) {
            enqueueTrigger("corner",current.target,current.card,current.at,current.owner === "p1" ? 1 : 2,batch,`cpu_corner_${unitId}_${corner}`,{corner});
          }
          // Mariner's Curse: a minion entering an affected (2x2) water site is submerged and the curse returns to hand.
          if (current.region === "surface" && isWater(state,current.at)) {
            const [cx,cy] = current.at.split(",").map(Number);
            for (const [anchor,cursed] of Object.entries(state.permanents)) {
              const [ax,ay] = anchor.split(",").map(Number);
              if (cx<ax || cx>ax+1 || cy<ay || cy>ay+1) continue;
              cursed.forEach((curse,curseIndex) => {
                const curseId = curse.instanceId || curse.card.instanceId;
                if (curse.card.name !== "Mariner's Curse" || !curseId ||
                    cursed.some(token => token.card.name === "Silenced" && token.attachedTo?.at === anchor && token.attachedTo.index === curseIndex)) return;
                enqueueTrigger("curse",{kind:"permanent",at:anchor,index:curseIndex,instanceId:curseId},curse.card,current.at,curse.owner,batch,
                  `cpu_curse_${curseId}_${unitId}`,{victim:current.target});
              });
            }
          }
        }
        if (!prior || (prior.at === current.at && prior.region === current.region)) continue;
        // Skirmishers of Mu: basic movement (not a forced relocation) may be followed by a ranged strike from any location on the path.
        if (current.card.name === "Skirmishers of Mu" && prior.at !== current.at && prior.region === current.region && !state.cpuForcedMovement &&
            current.target.kind === "permanent" && prior.target.kind === "permanent") {
          const mover = previous.permanents[prior.at]?.[prior.target.index];
          const path = mover ? movementRoutes(previous,prior.at,{...mover,card:prior.card}).get(current.at)?.path : undefined;
          enqueueTrigger("skirmish",current.target,current.card,current.at,current.owner === "p1" ? 1 : 2,batch,
            `cpu_skirmish_${current.target.instanceId || current.at}_${Date.now()}`,{path:path || [prior.at,current.at]});
        }
        const entity = prior.target.kind === "avatar" ? previous.avatars[prior.target.seat] : previous.permanents[prior.at][prior.target.index];
        const effect = entity.cpuTurnEffect;
        if (!effect?.blaze || effect.turn !== `${previous.turn}:${previous.currentPlayer}`) continue;
        // Only an effect's relocation is forced; every other change of place, void and layer shifts included, walks the steps left.
        const forced = !!state.cpuForcedMovement;
        // Drags are not range-checked in CPU matches: a trail only follows the steps left this turn.
        const mover = {...entity,card:prior.card,owner:prior.owner === "p1" ? 1 as const : 2 as const};
        const budget = forced ? undefined : movementAllowance(previous,mover)-(effect.steps || 0);
        if (budget !== undefined && (budget<=0 || !movementRoutes(previous,prior.at,mover,budget).get(current.at))) {
          store.getState().log(budget<=0 ? `Blaze: ${current.card.name} has no movement left this turn; no fire trail`
            : `Blaze: ${current.card.name} has no legal route within its ${budget} remaining step${budget === 1 ? "" : "s"}; no fire trail`);
          continue;
        }
        const id = `cpu_trail_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const [x,y] = current.at.split(",").map(Number);
        enqueue({id,tile:{x,y},spell:{at:current.at,index:-1,owner:current.owner === "p1" ? 1 : 2,instanceId:id,card:current.card},
          cpuEvent:{kind:"blazeTrail",from:prior.at,to:current.at,region:prior.region,source:current.target,forced,...(budget === undefined ? {} : {budget})},status:"choosingTarget",createdAt:Date.now()},batch);
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
        if (fromHand) revealPlay(tile.card,at,seat,"site");
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
    // King of the Realm: "You control all Mortals." Control returns to each Mortal's owner once no King rules;
    // Kings under both controllers leave control as it is.
    if (!restored && state.permanents !== previous.permanents) {
      const rulers = new Set(unitsNow().filter(unit => unit.card.name === "King of the Realm" && !isDisabled(state,unit)).map(unit => unit.owner));
      if (rulers.size <= 1) {
        const ruler = rulers.has("p1") ? 1 as const : rulers.has("p2") ? 2 as const : null;
        const permanents = store.getState().permanents, changes: GameState["permanents"] = {};
        for (const [at,items] of Object.entries(permanents)) items.forEach((item,index) => {
          const subTypes = item.card.subTypes || CARD_SUBTYPES[item.card.name]?.subTypes || "";
          if (!/\bMortal\b/.test(subTypes) || !["Minion","Token"].includes(item.card.type || "")) return;
          const native = item.cpuNativeOwner ?? item.owner, owner = ruler ?? native, keep = owner === native ? null : native;
          if (item.owner === owner && (item.cpuNativeOwner ?? null) === keep) return;
          changes[at] ||= [...permanents[at]];
          changes[at][index] = {...item,owner,cpuNativeOwner:keep,version:(item.version || 0)+1};
        });
        if (Object.keys(changes).length) {
          store.setState({permanents:{...store.getState().permanents,...changes}});
          store.getState().trySendPatch({permanents:changes});
        }
      }
    }
    if (store.getState().cpuPendingTriggerCount !== queue.length) store.setState({cpuPendingTriggerCount:queue.length});
    if ((queue.length || state.cpuEffectContinuations?.length || state.phase === "End") && !scheduled) { scheduled = true; queueMicrotask(drain); }
  });
}

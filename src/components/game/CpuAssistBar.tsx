"use client";

import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import type { SpellChoice, SpellState } from "@/lib/game/cpu/spellTypes";
import { cardText, getSpellChoices, projectileKey, supportsSpell } from "@/lib/game/cpu/spells";
import { useGameStore } from "@/lib/game/store";
import type { GameState, PendingMagic } from "@/lib/game/store/types";
import { getCellNumber, seatFromOwner } from "@/lib/game/store/utils/boardHelpers";
import { useSmallScreen } from "@/lib/hooks/useTouchDevice";

type TilePick = NonNullable<SpellChoice["picks"]>[number];
type Decision = NonNullable<SpellChoice["projectile"]>["decisions"][number];
type Targetable = Pick<SpellChoice, "key" | "label" | "picks" | "projectile">;
type AbilityChoice = ReturnType<typeof abilityChoices>[number];
/** A board click, or an effect taken from the list (which ends the path). */
type Step = {tile: string} | {base: string};
type Panel = "effects" | "rules";
type Ui = {session: string; steps: Step[]; decision: number | null; panel: Panel | null};
/** Every GameState field getSpellChoices reads, including the lazily required genesis,
 * treasure, timed aura, blaze/movement and label helpers. pendingMagic supplies the
 * event, the Raise Dead outcomes and the spell; its cpuChoice is the selection key. */
type MagicRulesState = SpellState & {pendingMagic: PendingMagic};
/** Every GameState field abilityChoices reads, directly or through the shared spells.js helpers. */
type AbilityRulesState = SpellState & Pick<GameState, "phase" | "cpuPendingTriggerCount" | "cpuEffectContinuations">;
type Aim<T extends Targetable> = ReturnType<typeof useTargeting<T>>;

const NO_CHOICES: SpellChoice[] = [];
const NO_ABILITIES: AbilityChoice[] = [];
const NO_TRIGGERS: NonNullable<GameState["cpuTriggerOptions"]> = [];
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";
const BTN = `shrink-0 rounded-full px-2.5 py-1 text-xs lg:px-3 lg:text-sm transition-colors disabled:opacity-40 ${FOCUS}`;
const PRIMARY = `${BTN} bg-emerald-600/90 hover:bg-emerald-500`;
const QUIET = `${BTN} bg-white/15 hover:bg-white/25`;
const CHIP = "min-w-0 max-w-[18rem] truncate rounded-full bg-white/10 px-2.5 py-0.5 text-xs lg:text-sm";
const NAME = "font-fantaisie text-amber-100";

const uniq = (tiles: (string | null | undefined)[]) => [...new Set(tiles.filter((tile): tile is string => !!tile))];
const baseOf = (choice: Targetable) => choice.projectile?.baseKey ?? choice.key;
const tilesOf = (pick: TilePick | undefined) => pick === undefined ? [] : Array.isArray(pick) ? pick : [pick];
/** Tiles that name exactly one option of a decision; options sharing a tile are only picked from the list. */
const soleTiles = (decision: Decision) => { const ats = decision.options.map(option => option.at); return uniq(ats).filter(at => ats.indexOf(at) === ats.lastIndexOf(at)); };
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (["INPUT","TEXTAREA","SELECT"].includes(target.tagName) || target.isContentEditable);
/** The site, avatar or permanent offering an ability. */
const sourceId = (choice: AbilityChoice) => `${choice.source.card.instanceId || choice.source.card.name}@${choice.source.at}`;

function eventLabel(event: NonNullable<PendingMagic["cpuEvent"]>): string {
  const labels: Record<typeof event.kind, string> = {
    unitEnd:"End-of-turn projectile",projectileImpact:"Choose the next projectile impact",geomancerFill:"Fill adjacent void with Rubble",
    treasurePlace:"Opponent chooses underwater placement",treasureRecover:"Recover treasure",drawChoice:"Choose a deck to draw from",
    randomChoice:"Choose a random outcome",fightChoice:event.kind === "fightChoice" && event.strikeOnly ? "Strike after arrival" : "Fight after arrival",
    genesis:"Genesis",auraEnd:"End-phase effect",blazeTrail:"Blaze trail",
  };
  return labels[event.kind];
}

/** Board-first narrowing: when casters sit on several tiles the first click picks the caster, then each click must
 * match the next picks entry (an array accepts any of its tiles). An effect taken from the list overrides the clicks. */
function narrow<T extends Targetable>(choices: T[], steps: Step[], casterTile: (choice: T) => string | null) {
  const casterPick = uniq(choices.map(casterTile)).length > 1;
  let remaining = choices, chosen: T | undefined, clicks = 0;
  for (const step of steps) {
    if ("base" in step) { chosen = choices.find(choice => baseOf(choice) === step.base); continue; }
    const index = clicks++ - (casterPick ? 1 : 0);
    remaining = remaining.filter(choice => index < 0 ? casterTile(choice) === step.tile : tilesOf(choice.picks?.[index]).includes(step.tile));
  }
  const index = clicks - (casterPick ? 1 : 0);
  const next = uniq(remaining.flatMap(choice => index < 0 ? [casterTile(choice)] : tilesOf(choice.picks?.[index])));
  // Another click only helps while the remaining choices' click paths still differ.
  const separable = next.length > 0 && new Set(remaining.map(choice => JSON.stringify([index < 0 ? casterTile(choice) : "",(choice.picks || []).slice(Math.max(index,0))]))).size > 1;
  const unreachable = index < 0 ? 0 : remaining.filter(choice => !tilesOf(choice.picks?.[index]).length).length;
  return {remaining,next,index,separable,unreachable,casterPick,target:chosen ?? (remaining.length === 1 ? remaining[0] : undefined)};
}

function instruction(view: ReturnType<typeof narrow>, decision?: Decision, clickable = false) {
  if (decision) return `${decision.label} · ${clickable ? "click a highlighted tile or pick below" : "pick below"}`;
  if (!view.remaining.length) return "No legal choices in the current position";
  if (view.target) return "";
  if (!view.separable) return "choose an effect below";
  return view.index < 0 ? "click who casts" : view.index === 0 ? "click a target" : "click the destination";
}

/** Local click path + board highlights for one list of choices; the picker selection never enters the match state. */
function useTargeting<T extends Targetable>({session,choices,casterTile,active,selected,decisions,onOption,sources:idle}: {
  session: string; choices: T[]; casterTile: (choice: T) => string | null; active: boolean;
  selected?: T; decisions?: Decision[]; onOption?: (index: number, key: string) => void; sources?: string[];
}) {
  const fresh = (): Ui => ({session,steps:selected ? [{base:baseOf(selected)}] : [],decision:null,panel:null});
  const [stored,setUi] = useState<Ui>(fresh);
  // A new pending effect, turn or choice list starts a fresh path (keeping an effect the store already holds).
  const ui = stored.session === session ? stored : fresh();
  if (stored.session !== session) setUi(ui);
  const view = useMemo(() => narrow(choices,ui.steps,casterTile),[choices,ui.steps,casterTile]);
  const decisionIndex = active && ui.decision !== null && decisions?.[ui.decision] ? ui.decision : null;
  const decision = decisionIndex === null ? undefined : decisions?.[decisionIndex];
  const target = active ? view.target : selected;
  const tiles = !active ? [] : decision ? soleTiles(decision) : view.target ? [] : view.next;
  const glow = target ? uniq((target.picks || []).flatMap(tilesOf)) : uniq(ui.steps.map((step,index) => "tile" in step && !(index === 0 && view.casterPick) ? step.tile : null));
  const casters = uniq((target ? [target] : view.remaining).map(casterTile));
  const request = `${session}#${ui.steps.map(step => "tile" in step ? step.tile : `=${step.base}`).join(">")}#${decisionIndex ?? ""}`;
  const layer = [tiles,glow,idle ?? (casters.length === 1 ? casters : [])].map(list => list.join(" ")).join("|");
  useEffect(() => {
    const [candidates,lit,origins] = layer.split("|").map(part => part ? part.split(" ") : []);
    useCpuBoardPicker.getState().configure(request,candidates);
    useCpuBoardPicker.getState().setGlow(request,lit,origins);
    return () => useCpuBoardPicker.getState().clear(request);
  },[request,layer]);
  const pickOption = useCallback((index: number, key: string) => { onOption?.(index,key); setUi(prev => ({...prev,decision:null})); },[onOption]);
  const onTile = useCallback((tile: string) => {
    if (decisionIndex === null) { setUi(prev => ({...prev,steps:[...prev.steps,{tile}],panel:null})); return; }
    const matches = decisions?.[decisionIndex]?.options.filter(entry => entry.at === tile) ?? [];
    if (matches.length === 1) pickOption(decisionIndex,matches[0].key);
  },[decisionIndex,decisions,pickOption]);
  // Every step has its own request, so clicking the same tile again in the next step still registers.
  useEffect(() => useCpuBoardPicker.subscribe((picker,previous) => {
    if (picker.request === request && picker.selected && picker.selected !== previous.selected) onTile(picker.selected);
  }),[request,onTile]);
  const back = decisionIndex !== null ? () => setUi(prev => ({...prev,decision:null}))
    : active && choices.length > 1 && ui.steps.length ? () => setUi(prev => ({...prev,steps:prev.steps.slice(0,-1),panel:null})) : null;
  const choose = (base: string) => setUi(prev => {
    const last = prev.steps[prev.steps.length-1];
    return {...prev,steps:[...(last && "base" in last ? prev.steps.slice(0,-1) : prev.steps),{base}],panel:null};
  });
  const openDecision = (index: number) => setUi(prev => ({...prev,decision:prev.decision === index ? null : index,panel:null}));
  const toggle = (panel: Panel) => setUi(prev => ({...prev,panel:prev.panel === panel ? null : panel,decision:null}));
  return {view,tiles,decision,decisionIndex,panel:ui.panel,back,choose,openDecision,pickOption,toggle};
}

/** Escape backs out (or cancels), but never while typing or while Escape serves the hand's own drag/hover cleanup. */
function useEscape(handler: (() => void) | null) {
  useEffect(() => {
    if (!handler) return;
    let busy = false;
    // Capture phase: read the hand state before Hand3D's bubbling Escape listener resets it.
    const before = (event: KeyboardEvent) => { const s = useGameStore.getState(); busy = typing(event.target) || typing(document.activeElement) || s.dragFromHand || !!s.dragFromPile || s.mouseInHandZone || s.handHoverCount > 0; };
    const onKey = (event: KeyboardEvent) => { if (event.key !== "Escape" || event.defaultPrevented || busy) return; event.preventDefault(); handler(); };
    window.addEventListener("keydown",before,true);
    window.addEventListener("keydown",onKey);
    return () => { window.removeEventListener("keydown",before,true); window.removeEventListener("keydown",onKey); };
  },[handler]);
}

function Shell({children,below,bare = false}: {children: ReactNode; below?: ReactNode; bare?: boolean}) {
  const small = useSmallScreen();
  return <div className={`fixed inset-x-0 ${small ? "top-[calc(env(safe-area-inset-top,0px)+2.5rem)] px-3" : "top-6 px-4"} z-[100] pointer-events-none flex justify-center`}>
    <div className="flex w-full max-w-[44rem] flex-col items-center gap-2">
      {bare ? children : <div className={`pointer-events-auto flex max-w-full flex-wrap items-center bg-black/90 text-white shadow-lg ring-1 ring-white/20 select-none ${small ? "w-full gap-1.5 rounded-2xl px-3 py-2 text-xs" : "justify-center gap-2 rounded-full px-5 py-2 text-base"}`}>{children}</div>}
      {below}
    </div>
  </div>;
}

function Popover({title,onClose,children}: {title: string; onClose?: () => void; children: ReactNode}) {
  return <section aria-label={title} className="pointer-events-auto max-h-[40vh] w-full overflow-y-auto rounded-2xl bg-black/90 p-2 text-white shadow-xl ring-1 ring-white/20">
    <div className="mb-1 flex items-center justify-between gap-2 px-1 text-xs text-white/60">
      <span className="truncate">{title}</span>
      {onClose && <button type="button" aria-label={`Close ${title}`} className={`rounded-full p-1 hover:bg-white/10 hover:text-white ${FOCUS}`} onClick={onClose}><X className="h-3.5 w-3.5" /></button>}
    </div>
    {children}
  </section>;
}

function OptionList({items,onPick}: {items: {id: string; label: string; current?: boolean}[]; onPick: (id: string) => void}) {
  return <ul className="grid gap-1">{items.map(item => <li key={item.id}>
    <button type="button" aria-pressed={item.current} onClick={() => onPick(item.id)}
      className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${FOCUS} ${item.current ? "bg-emerald-700/60" : "bg-white/10 hover:bg-white/20"}`}>{item.label}</button>
  </li>)}</ul>;
}

/** The effect list under the bar: forced open while no click can separate the remaining effects, else on demand. */
function effectList<T extends Targetable>(aim: Aim<T>, all: T[]) {
  const {view} = aim, forced = !view.target && view.remaining.length > 1 && !view.separable, current = view.target && baseOf(view.target);
  const list = aim.panel === "effects" || forced ? <Popover title="Effects" onClose={forced ? undefined : () => aim.toggle("effects")}>
    <OptionList items={(view.remaining.length > 1 ? view.remaining : all).map(choice => ({id:baseOf(choice),label:choice.label,current:baseOf(choice) === current}))} onPick={aim.choose} />
  </Popover> : null;
  const toggle = all.length > 1 && !forced ? <button type="button" className={QUIET} aria-label="Show all effects" aria-expanded={aim.panel === "effects"} onClick={() => aim.toggle("effects")}>
    All effects{view.unreachable ? ` +${view.unreachable}` : ""}
  </button> : null;
  return {list,toggle};
}

const selectSpellView = (state: GameState) => ({pending:state.pendingMagic,actorKey:state.actorKey,turn:state.turn,setCpuMagicChoice:state.setCpuMagicChoice,
  cancelMagic:state.cancelMagic,confirmMagic:state.confirmMagic,completeCpuMagicManual:state.completeCpuMagicManual});

/** Null while no choice is displayed: a manual effect, or another seat that has not announced its choice yet. */
function selectSpellRules(state: GameState): MagicRulesState | null {
  const pending = state.pendingMagic;
  if (!pending || (!pending.cpuEvent && !supportsSpell(pending.spell.card.name || ""))) return null;
  const chooser = state.actorKey === seatFromOwner(pending.spell.owner) && pending.status !== "confirm";
  if (!chooser && !pending.cpuChoice) return null;
  return {pendingMagic:pending,pendingCombat:state.pendingCombat,board:state.board,permanents:state.permanents,permanentPositions:state.permanentPositions,
    avatars:state.avatars,players:state.players,zones:state.zones,turn:state.turn,currentPlayer:state.currentPlayer};
}

function SpellAssist() {
  const {pending,actorKey,turn,setCpuMagicChoice,cancelMagic,confirmMagic,completeCpuMagicManual} = useGameStore(useShallow(selectSpellView));
  const rules = useGameStore(useShallow(selectSpellRules));
  const choices = useMemo(() => rules ? getSpellChoices(rules,seatFromOwner(rules.pendingMagic.spell.owner),rules.pendingMagic.spell.card.name || "",rules.pendingMagic.cpuChoice) : NO_CHOICES,[rules]);
  const seat = pending ? seatFromOwner(pending.spell.owner) : null, name = pending?.spell.card.name || "", cpuChoice = pending?.cpuChoice;
  const manual = !!pending && !pending.cpuEvent && !supportsSpell(name);
  const canChoose = !!pending && !manual && actorKey === seat && pending.status !== "confirm";
  const selected = cpuChoice ? choices.find(choice => choice.key === cpuChoice) : undefined;
  const avatars = rules?.avatars, plan = selected?.projectile;
  const casterTile = useCallback((choice: SpellChoice) => {
    if (choice.caster.kind !== "avatar") return choice.caster.at;
    const pos = avatars?.[choice.caster.seat]?.pos;
    return pos ? `${pos[0]},${pos[1]}` : null;
  },[avatars]);
  const setOption = useCallback((index: number, option: string) => {
    if (!plan || !rules || !seat) return;
    const selections = [...plan.selections];
    selections[index] = option;
    const updated = getSpellChoices(rules,seat,name,projectileKey(plan.baseKey,selections)).find(choice => choice.projectile?.baseKey === plan.baseKey);
    if (updated) setCpuMagicChoice(updated.key);
  },[plan,rules,seat,name,setCpuMagicChoice]);
  const aim = useTargeting({session:`${pending?.id}|${turn}|${choices.map(baseOf).join(" ")}`,choices,casterTile,active:canChoose,selected,decisions:plan?.decisions,onOption:setOption});
  const {view} = aim, targetKey = view.target?.key, targetBase = view.target ? baseOf(view.target) : null, selectedBase = selected ? baseOf(selected) : null;
  // The store's cpuChoice mirrors the board path, so the bot and the confirm step see the same effect.
  useEffect(() => {
    if (!canChoose) return;
    if (targetKey && targetBase !== selectedBase) setCpuMagicChoice(targetKey);
    else if (!targetKey && cpuChoice) setCpuMagicChoice("");
  },[canChoose,targetKey,targetBase,selectedBase,cpuChoice,setCpuMagicChoice]);
  const cancellable = !!pending && !pending.cpuEvent && !pending.cpuRandomMinion && actorKey === seat;
  useEscape(canChoose ? aim.back ?? (cancellable ? cancelMagic : null) : manual && cancellable ? cancelMagic : null);
  if (!pending) return null;
  const header = <span className="flex min-w-0 items-baseline gap-1.5"><span className={NAME}>{name}</span>{pending.cpuEvent && <span className="truncate text-white/70">· {eventLabel(pending.cpuEvent)}</span>}</span>;
  if (manual) return <Shell below={aim.panel === "rules" && <Popover title="Rules" onClose={() => aim.toggle("rules")}><p className="whitespace-pre-line px-2 pb-1 text-sm">{pending.summaryText || cardText(pending.spell.card)}</p></Popover>}>
    {header}<span className="text-amber-200">Manual effect — resolve it on the board</span>
    <button type="button" className={QUIET} aria-expanded={aim.panel === "rules"} onClick={() => aim.toggle("rules")}>Rules</button>
    {actorKey === seat && <><button type="button" className={PRIMARY} onClick={completeCpuMagicManual}>Done</button><button type="button" className={QUIET} onClick={cancelMagic}>Cancel</button></>}
  </Shell>;
  if (!canChoose) return <Shell>{header}<span aria-hidden className="text-white/50">—</span>
    <span aria-live="polite" className="min-w-0 truncate" title={selected?.label}>{selected?.label || "Choosing…"}{pending.status === "confirm" ? " — Resolving…" : ""}</span>
  </Shell>;
  const {decision,decisionIndex} = aim, text = instruction(view,decision,aim.tiles.length > 0), effects = effectList(aim,choices);
  const below = decision && decisionIndex !== null ? <Popover title={decision.label} onClose={() => aim.openDecision(decisionIndex)}>
    <OptionList items={decision.options.map(option => ({id:option.key,label:option.label,current:option.key === plan?.selections[decisionIndex]}))} onPick={key => aim.pickOption(decisionIndex,key)} />
  </Popover> : effects.list;
  return <Shell below={below}>
    {header}
    {text && <span aria-live="polite" className="text-white/80">· {text}</span>}
    {view.target && <span className={CHIP} title={view.target.label}>{view.target.label}</span>}
    {plan && targetBase === selectedBase && plan.decisions.map((entry,index) => entry.options.length > 1 && <button key={index} type="button" className={`${QUIET} max-w-[14rem] truncate`}
      aria-pressed={decisionIndex === index} title={entry.label} onClick={() => aim.openDecision(index)}>
      <span className="text-white/60">{entry.label}:</span> {entry.options.find(option => option.key === plan.selections[index])?.label ?? "—"}
    </button>)}
    {effects.toggle}
    {aim.back && <button type="button" className={QUIET} onClick={aim.back}>Back</button>}
    <button type="button" className={PRIMARY} disabled={!selected || targetBase !== selectedBase} onClick={confirmMagic}>Confirm</button>
    {!pending.cpuEvent && <button type="button" className={QUIET} disabled={!!pending.cpuRandomMinion} onClick={cancelMagic}>Cancel</button>}
  </Shell>;
}

// The combat HUD's attack-choice bars own the same top slot and precede any pendingCombat, so the chips give way to them.
const selectAbilityView = (state: GameState) => ({actorKey:state.actorKey,matchEnded:state.matchEnded,matchId:state.matchId,turn:state.turn,currentPlayer:state.currentPlayer,
  activateCpuAbility:state.activateCpuAbility,combatBar:!!(state.attackChoice || state.attackTargetChoice || state.attackConfirm)});

/** Rules inputs only while an ability can be activated: this mirrors abilityChoices' gate, which yields no choices in every other state. */
function selectAbilityRules(state: GameState): AbilityRulesState | null {
  const seat = state.actorKey;
  if (!seat || state.matchEnded || state.cpuTriggerOptions?.length || state.phase !== "Main" || state.currentPlayer !== (seat === "p1" ? 1 : 2) ||
    state.pendingMagic || state.pendingCombat || state.cpuPendingTriggerCount || state.cpuEffectContinuations?.length) return null;
  return {phase:state.phase,currentPlayer:state.currentPlayer,turn:state.turn,pendingMagic:state.pendingMagic,pendingCombat:state.pendingCombat,
    cpuPendingTriggerCount:state.cpuPendingTriggerCount,cpuEffectContinuations:state.cpuEffectContinuations,board:state.board,permanents:state.permanents,
    permanentPositions:state.permanentPositions,avatars:state.avatars,players:state.players,zones:state.zones};
}

const sourceTile = (choice: AbilityChoice) => choice.source.at;

function AbilityAssist() {
  const {actorKey,matchEnded,matchId,turn,currentPlayer,activateCpuAbility,combatBar} = useGameStore(useShallow(selectAbilityView));
  const rules = useGameStore(useShallow(selectAbilityRules));
  const choices = useMemo(() => rules && actorKey ? abilityChoices(rules,actorKey) : NO_ABILITIES,[rules,actorKey]);
  const sources = useMemo(() => [...new Map(choices.map(choice => [sourceId(choice),choice.source])).entries()],[choices]);
  const request = `${matchId}:ability:${turn}:${currentPlayer}`, ids = sources.map(([id]) => id);
  const [picked,setPicked] = useState<{request: string; id: string} | null>(null);
  // Hidden chips stay hidden for the rest of the turn, until a source they did not offer gains an ability.
  const [closed,setClosed] = useState<{request: string; sources: string[]} | null>(null);
  const hidden = closed?.request === request && ids.every(id => closed.sources.includes(id));
  const active = picked?.request === request && ids.includes(picked.id) ? picked.id : null;
  const own = useMemo(() => active && !combatBar ? choices.filter(choice => sourceId(choice) === active) : NO_ABILITIES,[choices,active,combatBar]);
  const aim = useTargeting({session:`${request}|${active}|${own.map(baseOf).join(" ")}`,choices:own,casterTile:sourceTile,active:!!active,
    sources:active ? undefined : hidden || combatBar ? [] : uniq(sources.map(([,source]) => source.at))});
  const leave = useCallback(() => setPicked(null),[]);
  useEscape(combatBar ? null : aim.back ?? (active ? leave : null));
  if (!actorKey || matchEnded || !choices.length || combatBar) return null;
  if (hidden) return <Shell bare><button type="button" onClick={() => setClosed(null)} className={`pointer-events-auto rounded-full bg-black/90 px-3 py-1.5 text-sm text-amber-100 shadow-lg ring-1 ring-white/20 hover:bg-black ${FOCUS}`}>Show abilities</button></Shell>;
  const size = rules?.board.size, tileNo = (at: string) => { const [x,y] = at.split(",").map(Number); return size ? getCellNumber(x,y,size.w,size.h) : at; };
  if (!active) return <Shell>
    <span className="hidden text-sm text-white/60 lg:inline">Abilities</span>
    {sources.map(([id,source]) => <button key={id} type="button" className={`${QUIET} ${NAME}`} aria-label={`${source.card.name} abilities, Tile #${tileNo(source.at)}`} onClick={() => setPicked({request,id})}>
      {source.card.name}{sources.filter(([,other]) => other.card.name === source.card.name).length > 1 && <span className="ml-1 font-sans text-white/60">#{tileNo(source.at)}</span>}
    </button>)}
    <button type="button" aria-label="Hide abilities for this turn" title="Hide for this turn" onClick={() => setClosed({request,sources:ids})}
      className={`shrink-0 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white ${FOCUS}`}><X className="h-4 w-4" /></button>
  </Shell>;
  const {view} = aim, text = instruction(view), effects = effectList(aim,own), source = sources.find(([id]) => id === active)?.[1];
  return <Shell below={effects.list}>
    <span className={NAME}>{source?.card.name}</span>
    {text && <span aria-live="polite" className="text-white/80">· {text}</span>}
    {view.target && <span className={CHIP} title={view.target.label}>{view.target.label}</span>}
    {effects.toggle}
    <button type="button" className={QUIET} onClick={aim.back ?? leave}>Back</button>
    <button type="button" className={PRIMARY} disabled={!view.target} onClick={() => { if (view.target) activateCpuAbility(view.target.key); leave(); }}>Resolve</button>
  </Shell>;
}

const selectTriggers = (state: GameState) => ({triggers:state.cpuTriggerOptions?.length ? state.cpuTriggerOptions : NO_TRIGGERS,chooseCpuTrigger:state.chooseCpuTrigger});

function TriggerAssist() {
  const {triggers,chooseCpuTrigger} = useGameStore(useShallow(selectTriggers));
  return <Shell below={<Popover title="Triggers"><OptionList items={triggers} onPick={chooseCpuTrigger} /></Popover>}>
    <span className={NAME}>Choose the next trigger to resolve</span>
  </Shell>;
}

const selectMode = (state: GameState) => state.pendingMagic?.spell.card.name ? "spell" : state.actorKey && !state.matchEnded && state.cpuTriggerOptions?.length ? "trigger" : "ability";

/** CPU-match assistant: one slim bar at the top of the screen for spells, CPU prompts, trigger order and
 * activated abilities, with targets clicked on the board (CpuFieldTargets) instead of dropdowns. */
export default function CpuAssistBar() {
  const mode = useGameStore(selectMode);
  return mode === "spell" ? <SpellAssist /> : mode === "trigger" ? <TriggerAssist /> : <AbilityAssist />;
}

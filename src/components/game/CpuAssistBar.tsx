"use client";

import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import CpuCardOrder from "@/components/game/CpuCardOrder";
import CpuCardPick, { type CardPickItem, type PickCard } from "@/components/game/CpuCardPick";
import { RcButton } from "@/components/ui/rc-button";
import { abilitySourceId, type AbilityChoice, useCpuAbilityPicker, useReadyAbilities } from "@/lib/game/cpu/abilityPicker";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { parsePickToken, unitToken } from "@/lib/game/cpu/pickTokens";
import { CPU_TRIGGERS_IN_ORDER, type SpellChoice, type SpellOperation, type SpellState } from "@/lib/game/cpu/spellTypes";
import { cardText, getSpellChoices, projectileKey, supportsSpell } from "@/lib/game/cpu/spells";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PendingMagic } from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";
import { useSmallScreen } from "@/lib/hooks/useTouchDevice";

type TilePick = NonNullable<SpellChoice["picks"]>[number];
type Decision = NonNullable<SpellChoice["projectile"]>["decisions"][number];
/** The optional button-text and card-row fields a choice may carry (see SpellChoice). */
type ChoiceExtras = {pickLabels?: Record<string, string>; card?: PickCard; badge?: string};
type Targetable = Pick<SpellChoice, "key" | "label" | "picks" | "projectile"> & ChoiceExtras;
/** A board click (any pick token), a card taken from the card row, or an effect taken from the list (which ends the path). */
type Step = {tile: string} | {card: string} | {base: string};
type Panel = "effects" | "options" | "rules";
type Role = "caster" | "target" | "destination" | null;
type Ui = {session: string; steps: Step[]; decision: number | null; panel: Panel | null};
/** Every GameState field getSpellChoices reads, including the lazily required genesis,
 * treasure, timed aura, blaze/movement and label helpers. pendingMagic supplies the
 * event, the Raise Dead outcomes and the spell; its cpuChoice is the selection key. */
type MagicRulesState = SpellState & {pendingMagic: PendingMagic};
type Aim<T extends Targetable> = ReturnType<typeof useTargeting<T>>;

const NO_CHOICES: SpellChoice[] = [];
const NO_ABILITIES: AbilityChoice[] = [];
const NO_TRIGGERS: NonNullable<GameState["cpuTriggerOptions"]> = [];
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring";
/** Bar pill sizing on top of RcButton size="xs": compact on phones, a step up on large screens. */
const PILL = "h-auto shrink-0 rounded-full py-1 lg:px-3 lg:text-sm";
const CHIP = "min-w-0 max-w-[18rem] truncate rounded-full border border-rc-accent/35 bg-rc-accent/8 px-2.5 py-0.5 text-xs text-rc-fg-strong lg:text-sm";
const NAME = "font-rc-display text-rc-spark";

const uniq = (tiles: (string | null | undefined)[]) => [...new Set(tiles.filter((tile): tile is string => !!tile))];
const baseOf = (choice: Targetable) => choice.projectile?.baseKey ?? choice.key;
const tilesOf = (pick: TilePick | undefined) => pick === undefined ? [] : Array.isArray(pick) ? pick : [pick];
/** Choices about the same card with the same badge share one entry of the card row. */
const cardKeyOf = (choice: Targetable) => choice.card ? [choice.card.instanceId ?? "",choice.card.cardId ?? "",choice.card.name,choice.badge ?? ""].join("|") : null;
/** Tokens that name exactly one option of a decision; options sharing a token (or without one) are only picked from the list. */
const soleTiles = (decision: Decision) => { const ats = decision.options.map(option => option.at); return uniq(ats).filter(at => ats.indexOf(at) === ats.lastIndexOf(at)); };
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (["INPUT","TEXTAREA","SELECT"].includes(target.tagName) || target.isContentEditable);
type ReorderOperation = Extract<SpellOperation, {kind: "reorder"}>;
/** The deck order a choice sets (Observatory, the Rivers), when that is all the choice does. */
const reorderOf = (choice: SpellChoice): ReorderOperation | null => {
  const op = choice.operations.length === 1 ? choice.operations[0] : undefined;
  return op?.kind === "reorder" ? op : null;
};

function eventLabel(event: NonNullable<PendingMagic["cpuEvent"]>): string {
  const labels: Record<typeof event.kind, string> = {
    unitEnd:"End-of-turn projectile",projectileImpact:"Choose the next projectile impact",geomancerFill:"Fill adjacent void with Rubble",
    treasurePlace:"Opponent chooses underwater placement",treasureRecover:"Recover treasure",drawChoice:"Choose a deck to draw from",
    randomChoice:"Choose a random outcome",fightChoice:event.kind === "fightChoice" && event.strikeOnly ? "Strike after arrival" : "Fight after arrival",
    genesis:"Genesis",auraEnd:"End-phase effect",blazeTrail:"Blaze trail",
  };
  return labels[event.kind];
}

/** Board-first narrowing: when casters differ the first click picks the caster, then each click must match the next picks
 * entry (an array accepts any of its tokens). Effects about different cards are first told apart by a row of those cards.
 * An effect taken from the list overrides the clicks. */
function narrow<T extends Targetable>(choices: T[], steps: Step[], casterTile: (choice: T) => string | null) {
  const casterPick = uniq(choices.map(casterTile)).length > 1;
  let remaining = choices, chosen: T | undefined, clicks = 0, pool: T[] | null = null, card: string | null = null;
  const take = (token: string) => {
    const index = clicks++ - (casterPick ? 1 : 0);
    remaining = remaining.filter(choice => index < 0 ? casterTile(choice) === token : tilesOf(choice.picks?.[index]).includes(token));
  };
  const peek = () => {
    const index = clicks - (casterPick ? 1 : 0);
    const clickable = uniq(remaining.flatMap(choice => index < 0 ? [casterTile(choice)] : tilesOf(choice.picks?.[index])));
    // Another click only helps while the remaining choices' click paths still differ.
    const byClick = clickable.length > 0 && new Set(remaining.map(choice => JSON.stringify([index < 0 ? casterTile(choice) : "",(choice.picks || []).slice(Math.max(index,0))]))).size > 1;
    // The card row comes after the caster and before the other clicks (or once clicks no longer separate), and stays up once used.
    const cardPool = pool ?? (index >= 0 && (chosen || index === 0 || !byClick) ? remaining : null);
    const cards = cardPool && cardPool.length > 1 && cardPool.every(choice => choice.card) && uniq(cardPool.map(cardKeyOf)).length > 1 ? cardPool : null;
    return {index,clickable,byClick,cards,offering:!!cards && card === null && !chosen};
  };
  /** Steps taken for the player: every remaining choice goes through the same lone token (e.g. the only crew ally). */
  const auto: string[] = [];
  const advance = () => {
    for (let now = peek(); !chosen && !now.offering && now.index >= 0 && now.clickable.length === 1 && now.byClick
      && remaining.every(choice => tilesOf(choice.picks?.[now.index]).includes(now.clickable[0])); now = peek()) {
      auto.push(now.clickable[0]);
      take(now.clickable[0]);
    }
  };
  for (const step of steps) {
    if ("base" in step) chosen = choices.find(choice => baseOf(choice) === step.base);
    else if ("card" in step) { pool = remaining; card = step.card; remaining = remaining.filter(choice => cardKeyOf(choice) === step.card); }
    // The player's clicks never include the steps taken for them, so those are replayed first.
    else { advance(); take(step.tile); }
  }
  advance();
  const {index,clickable,byClick,cards,offering} = peek();
  const unreachable = offering || index < 0 ? 0 : remaining.filter(choice => !tilesOf(choice.picks?.[index]).length).length;
  return {remaining,next:offering ? [] : clickable,index,separable:offering || byClick,unreachable,casterPick,cards,card,offering,auto,
    target:chosen ?? (remaining.length === 1 ? remaining[0] : undefined)};
}

/** What the next click is on, named from the kinds of its candidate tokens (pickTokens.js). */
function clickText(tokens: string[], seat: string | null, role: Role): string {
  const parsed = tokens.map(parsePickToken);
  const kinds = uniq(parsed.map(token => token?.kind ?? "other"));
  const kind = kinds.length === 1 ? kinds[0] : "mixed";
  if (kind === "mixed" && role !== "caster" && !kinds.includes("other")) {
    // e.g. the next Chain Lightning link: "click a button or a card on the board".
    const nouns: Record<string, string> = {tile:"a tile",unit:"a card",opt:"a button",dir:"an arrow",hand:"a card in your hand",pile:"a pile",draw:"a pile"};
    return `click ${uniq(kinds.map(entry => nouns[entry])).join(" or ")}${kinds.includes("hand") ? "" : " on the board"}`;
  }
  if (kind === "tile") return role === "caster" ? "click who casts" : role === "target" ? "click a target" : role === "destination" ? "click the destination" : "click a tile";
  if (role === "caster") return kind === "unit" ? "click the caster's card on the board" : "click who casts";
  if (kind === "unit") return "click a card on the board";
  if (kind === "hand") return parsed.every(token => token?.kind === "hand" && token.seat === seat) ? "click a card in your hand" : "click a card in their hand";
  if (kind === "dir") return "pick a direction";
  if (kind === "opt") return "choose on the board";
  if (kind === "pile" || kind === "draw") {
    const piles = uniq(parsed.flatMap(token => token?.kind === "pile" ? [token.pile] : ["spellbook","atlas"]));
    return piles.length === 1 ? `click your ${piles[0]}` : "click your spellbook or atlas";
  }
  return "click a highlighted card or tile";
}

function instruction(view: ReturnType<typeof narrow>, seat: string | null, decision?: {entry: Decision; tokens: string[]; listed: boolean}) {
  if (decision) return `${decision.entry.label} · ${decision.tokens.length ? `${clickText(decision.tokens,seat,null)}${decision.listed ? " or pick below" : ""}` : "pick below"}`;
  if (!view.remaining.length) return "No legal choices in the current position";
  if (view.target) return "";
  if (view.offering) return "click a card below";
  if (!view.separable) return "choose an effect below";
  return clickText(view.next,seat,view.index < 0 ? "caster" : view.index === 0 ? "target" : "destination");
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
  const sole = useMemo(() => decision ? soleTiles(decision) : [],[decision]);
  // A decision is chosen on the board; its option list opens only for options no token reaches, or on request.
  const unlisted = !!decision && decision.options.some(option => !option.at || !sole.includes(option.at));
  const target = active ? view.target : selected;
  const tiles = !active ? [] : decision ? sole : view.target ? [] : view.next;
  const glow = target ? uniq((target.picks || []).flatMap(tilesOf)) : uniq([...ui.steps.map((step,index) => "tile" in step && !(index === 0 && view.casterPick) ? step.tile : null),...view.auto]);
  const casters = uniq((target ? [target] : view.remaining).map(casterTile));
  const request = `${session}#${ui.steps.map(step => "tile" in step ? step.tile : "card" in step ? `@${step.card}` : `=${step.base}`).join(">")}#${decisionIndex ?? ""}`;
  const layer = JSON.stringify([tiles,glow,idle ?? (casters.length === 1 ? casters : [])]);
  // Text for the tokens drawn as buttons and arrows: decision options, then the choices' own (shorter) button text.
  const labels = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const entry of decision ? [...(decisions ?? []),decision] : decisions ?? []) for (const option of entry.options) if (option.at) merged[option.at] = option.label;
    for (const choice of choices) Object.assign(merged,choice.pickLabels);
    return JSON.stringify(merged);
  },[choices,decisions,decision]);
  useEffect(() => {
    const [candidates,lit,origins] = JSON.parse(layer) as [string[], string[], string[]];
    const picker = useCpuBoardPicker.getState();
    picker.configure(request,candidates);
    picker.setGlow(request,lit,origins);
    picker.setLabels(request,JSON.parse(labels) as Record<string, string>);
    return () => useCpuBoardPicker.getState().clear(request);
  },[request,layer,labels]);
  const pickOption = useCallback((index: number, key: string) => { onOption?.(index,key); setUi(prev => ({...prev,decision:null,panel:null})); },[onOption]);
  const onTile = useCallback((tile: string) => {
    if (decisionIndex === null) { setUi(prev => ({...prev,steps:[...prev.steps,{tile}],panel:null})); return; }
    const matches = decisions?.[decisionIndex]?.options.filter(entry => entry.at === tile) ?? [];
    if (matches.length === 1) pickOption(decisionIndex,matches[0].key);
  },[decisionIndex,decisions,pickOption]);
  // Every step has its own request, so clicking the same tile again in the next step still registers.
  useEffect(() => useCpuBoardPicker.subscribe((picker,previous) => {
    if (picker.request === request && picker.selected && picker.selected !== previous.selected) onTile(picker.selected);
  }),[request,onTile]);
  const back = decisionIndex !== null ? () => setUi(prev => ({...prev,decision:null,panel:null}))
    : active && choices.length > 1 && ui.steps.length ? () => setUi(prev => ({...prev,steps:prev.steps.slice(0,-1),panel:null})) : null;
  const choose = (base: string) => setUi(prev => {
    const last = prev.steps[prev.steps.length-1];
    return {...prev,steps:[...(last && "base" in last ? prev.steps.slice(0,-1) : prev.steps),{base}],panel:null};
  });
  // Another card replaces the earlier card pick and the clicks made after it.
  const pickCard = (card: string) => setUi(prev => {
    const at = prev.steps.findIndex(step => "card" in step);
    return {...prev,steps:[...(at < 0 ? prev.steps.filter(step => !("base" in step)) : prev.steps.slice(0,at)),{card}],panel:null};
  });
  const openDecision = (index: number) => setUi(prev => ({...prev,decision:prev.decision === index ? null : index,panel:null}));
  const toggle = (panel: Panel) => setUi(prev => ({...prev,panel:prev.panel === panel ? null : panel,decision:panel === "options" ? prev.decision : null}));
  return {view,tiles,decision,decisionIndex,listed:unlisted || (!!decision && ui.panel === "options"),listable:!!decision && !unlisted,
    panel:ui.panel,back,choose,pickCard,openDecision,pickOption,toggle};
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

// Below the status bar pill (top 0.75rem, about 2.5rem tall on desktop), in the slot the combat HUD's bars share.
function Shell({children,below,bare = false}: {children: ReactNode; below?: ReactNode; bare?: boolean}) {
  const small = useSmallScreen();
  return <div className={`fixed inset-x-0 ${small ? "top-[calc(env(safe-area-inset-top,0px)+2.5rem)] px-3" : "top-16 px-4"} z-[100] pointer-events-none flex justify-center`}>
    <div className="flex w-full max-w-[44rem] flex-col items-center gap-2">
      {bare ? children : <div className={`pointer-events-auto flex max-w-full flex-wrap items-center border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel select-none ${small ? "w-full gap-1.5 rounded-rc-lg px-3 py-2 text-xs" : "justify-center gap-2 rounded-full px-5 py-2 text-base"}`}>{children}</div>}
      {below}
    </div>
  </div>;
}

function Popover({title,onClose,children}: {title: string; onClose?: () => void; children: ReactNode}) {
  return <section aria-label={title} className="thin-scrollbar pointer-events-auto max-h-[40vh] w-full overflow-y-auto rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.9)] p-2 font-rc-sans text-rc-fg shadow-rc-panel">
    <div className="mb-1 flex items-center justify-between gap-2 px-1 font-rc-mono text-xs tracking-[0.08em] text-rc-fg-subtle">
      <span className="truncate">{title}</span>
      {onClose && <button type="button" aria-label={`Close ${title}`} className={`cursor-pointer rounded-rc-md p-1 text-rc-fg-muted hover:bg-rc-line/6 hover:text-rc-fg-strong ${FOCUS}`} onClick={onClose}><X className="h-3.5 w-3.5" /></button>}
    </div>
    {children}
  </section>;
}

function OptionList({items,onPick}: {items: {id: string; label: string; current?: boolean}[]; onPick: (id: string) => void}) {
  return <ul className="grid gap-1">{items.map(item => <li key={item.id}>
    <button type="button" aria-pressed={item.current} onClick={() => onPick(item.id)}
      className={`w-full cursor-pointer rounded-rc-md border px-3 py-2 text-left text-sm transition-colors ${FOCUS} ${item.current ? "border-rc-success/60 bg-rc-success/16 text-rc-success-ink" : "border-rc-line/12 bg-black/30 hover:border-rc-accent/40 hover:text-rc-fg-strong"}`}>{item.label}</button>
  </li>)}</ul>;
}

/** The effect list under the bar: forced open only while neither a click nor a card can separate the remaining effects
 * (the last resort), else behind the "All effects" toggle. */
function effectList<T extends Targetable>(aim: Aim<T>, all: T[]) {
  const {view} = aim, forced = !view.target && view.remaining.length > 1 && !view.separable, current = view.target && baseOf(view.target);
  const list = aim.panel === "effects" || forced ? <Popover title="Effects" onClose={forced ? undefined : () => aim.toggle("effects")}>
    <OptionList items={(view.remaining.length > 1 ? view.remaining : all).map(choice => ({id:baseOf(choice),label:choice.label,current:baseOf(choice) === current}))} onPick={aim.choose} />
  </Popover> : null;
  const toggle = all.length > 1 && !forced ? <RcButton variant="quiet" size="xs" className={PILL} aria-label="Show all effects" aria-expanded={aim.panel === "effects"} onClick={() => aim.toggle("effects")}>
    All effects{view.unreachable ? ` +${view.unreachable}` : ""}
  </RcButton> : null;
  return {list,toggle};
}

/** The card row entries for choices told apart by their card; another seat's hidden cards are drawn face down. */
function cardItems<T extends Targetable>(choices: T[], concealed: (card: PickCard) => boolean): CardPickItem[] {
  const items = new Map<string, CardPickItem>();
  for (const choice of choices) {
    const id = cardKeyOf(choice);
    if (id && choice.card && !items.has(id)) items.set(id,{id,card:choice.card,badge:choice.badge,hidden:concealed(choice.card)});
  }
  return [...items.values()];
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

type Caster = SpellChoice["caster"];

function SpellAssist() {
  const {pending,actorKey,turn,setCpuMagicChoice,cancelMagic,confirmMagic,completeCpuMagicManual} = useGameStore(useShallow(selectSpellView));
  const rules = useGameStore(useShallow(selectSpellRules));
  const choices = useMemo(() => rules ? getSpellChoices(rules,seatFromOwner(rules.pendingMagic.spell.owner),rules.pendingMagic.spell.card.name || "",rules.pendingMagic.cpuChoice) : NO_CHOICES,[rules]);
  // Deck-order effects (Observatory, the Rivers) are chosen on the cards themselves, never from a list of orders.
  const reorders = useMemo(() => choices.length > 1 && choices.every(choice => reorderOf(choice)) ? choices : null,[choices]);
  const seat = pending ? seatFromOwner(pending.spell.owner) : null, name = pending?.spell.card.name || "", cpuChoice = pending?.cpuChoice;
  const manual = !!pending && !pending.cpuEvent && !supportsSpell(name);
  const canChoose = !!pending && !manual && actorKey === seat && pending.status !== "confirm";
  const selected = cpuChoice ? choices.find(choice => choice.key === cpuChoice) : undefined;
  const avatars = rules?.avatars, permanents = rules?.permanents, zones = rules?.zones, plan = selected?.projectile;
  const tileOf = useCallback((caster: Caster) => {
    if (caster.kind !== "avatar") return caster.at;
    const pos = avatars?.[caster.seat]?.pos;
    return pos ? `${pos[0]},${pos[1]}` : null;
  },[avatars]);
  const casterToken = useCallback((caster: Caster) => {
    if (caster.kind === "avatar") return unitToken(caster);
    if (caster.kind === "site") return caster.at;
    const item = permanents?.[caster.at]?.[caster.index];
    return unitToken({kind:"permanent",at:caster.at,index:caster.index,instanceId:item?.instanceId || item?.card.instanceId});
  },[permanents]);
  // Two casters on one tile (an avatar and an Apprentice Wizard) are told apart by clicking the caster's card, not the shared tile.
  const crowded = useMemo(() => {
    const byTile = new Map<string, Set<string>>();
    for (const {caster} of choices) {
      const tile = tileOf(caster);
      if (tile) byTile.set(tile,(byTile.get(tile) ?? new Set<string>()).add(casterToken(caster)));
    }
    return new Set([...byTile].flatMap(([tile,tokens]) => tokens.size > 1 ? [tile] : []));
  },[choices,tileOf,casterToken]);
  const casterTile = useCallback((choice: SpellChoice) => {
    const tile = tileOf(choice.caster);
    return tile && crowded.has(tile) ? casterToken(choice.caster) : tile;
  },[tileOf,casterToken,crowded]);
  const setOption = useCallback((index: number, option: string) => {
    if (!plan || !rules || !seat) return;
    const selections = [...plan.selections];
    selections[index] = option;
    const updated = getSpellChoices(rules,seat,name,projectileKey(plan.baseKey,selections)).find(choice => choice.projectile?.baseKey === plan.baseKey);
    if (updated) setCpuMagicChoice(updated.key);
  },[plan,rules,seat,name,setCpuMagicChoice]);
  // A Genesis has no caster to pick: light the card whose Genesis it is, not the avatar (whose tile may hold an ability source).
  const origin = pending?.cpuEvent?.kind === "genesis" ? [pending.spell.at] : undefined;
  const aim = useTargeting({session:`${pending?.id}|${turn}|${choices.map(baseOf).join(" ")}`,choices,casterTile,active:canChoose,selected,decisions:plan?.decisions,onOption:setOption,sources:origin});
  const {view} = aim, targetKey = view.target?.key, targetBase = view.target ? baseOf(view.target) : null, selectedBase = selected ? baseOf(selected) : null;
  // The store's cpuChoice mirrors the board path, so the bot and the confirm step see the same effect.
  useEffect(() => {
    if (!canChoose || reorders) return;
    if (targetKey && targetBase !== selectedBase) setCpuMagicChoice(targetKey);
    else if (!targetKey && cpuChoice) setCpuMagicChoice("");
  },[canChoose,reorders,targetKey,targetBase,selectedBase,cpuChoice,setCpuMagicChoice]);
  const cancellable = !!pending && !pending.cpuEvent && !pending.cpuRandomMinion && actorKey === seat;
  useEscape(canChoose ? aim.back ?? (cancellable ? cancelMagic : null) : manual && cancellable ? cancelMagic : null);
  if (!pending) return null;
  const header = <span className="flex min-w-0 items-baseline gap-1.5"><span className={NAME}>{name}</span>{pending.cpuEvent && <span className="truncate text-rc-fg-muted">· {eventLabel(pending.cpuEvent)}</span>}</span>;
  if (manual) return <Shell below={aim.panel === "rules" && <Popover title="Rules" onClose={() => aim.toggle("rules")}><p className="whitespace-pre-line px-2 pb-1 text-sm">{pending.summaryText || cardText(pending.spell.card)}</p></Popover>}>
    {header}<span className="text-rc-accent-link">Manual effect — resolve it on the board</span>
    <RcButton variant="quiet" size="xs" className={PILL} aria-expanded={aim.panel === "rules"} onClick={() => aim.toggle("rules")}>Rules</RcButton>
    {actorKey === seat && <><RcButton size="xs" className={PILL} onClick={completeCpuMagicManual}>Done</RcButton><RcButton variant="quiet" size="xs" className={PILL} onClick={cancelMagic}>Cancel</RcButton></>}
  </Shell>;
  if (!canChoose) return <Shell>{header}<span aria-hidden className="text-rc-fg-dim">—</span>
    <span aria-live="polite" className="min-w-0 truncate" title={reorders ? undefined : selected?.label}>{reorders ? "Arranging their next spells" : selected?.label || "Choosing…"}{pending.status === "confirm" ? " — Resolving…" : ""}</span>
  </Shell>;
  if (reorders && rules && seat) return <ReorderAssist header={header} choices={reorders} spellbook={rules.zones[seat].spellbook} cpuChoice={cpuChoice} setCpuMagicChoice={setCpuMagicChoice} confirmMagic={confirmMagic} />;
  const {decision,decisionIndex} = aim, effects = effectList(aim,choices);
  const text = instruction(view,seat,decision ? {entry:decision,tokens:aim.tiles,listed:aim.listed} : undefined);
  // Only this seat's own choice reaches here; a card still in the other seat's hand or decks never shows its face.
  const other = seat === "p1" ? "p2" : "p1";
  const concealed = (card: PickCard) => !!card.instanceId && !!zones && [zones[other].hand,zones[other].spellbook,zones[other].atlas].some(pile => pile.some(entry => entry.instanceId === card.instanceId));
  const cardRow = view.cards && <CpuCardPick title="Choose a card" items={cardItems(view.cards,concealed)} selected={view.target ? cardKeyOf(view.target) : view.card} onPick={aim.pickCard} />;
  const below = decision && decisionIndex !== null ? aim.listed && <Popover title={decision.label} onClose={() => aim.openDecision(decisionIndex)}>
    <OptionList items={decision.options.map(option => ({id:option.key,label:option.label,current:option.key === plan?.selections[decisionIndex]}))} onPick={key => aim.pickOption(decisionIndex,key)} />
  </Popover> : <>{cardRow}{effects.list}</>;
  return <Shell below={below}>
    {header}
    {text && <span aria-live="polite" className="text-rc-fg-muted">· {text}</span>}
    {view.target && <span className={CHIP} title={view.target.label}>{view.target.label}</span>}
    {plan && targetBase === selectedBase && plan.decisions.map((entry,index) => entry.options.length > 1 && <RcButton key={index} variant="quiet" size="xs" className={`${PILL} block max-w-[14rem] truncate`}
      aria-pressed={decisionIndex === index} title={entry.label} onClick={() => aim.openDecision(index)}>
      <span className="text-rc-fg-subtle">{entry.label}:</span> {entry.options.find(option => option.key === plan.selections[index])?.label ?? "—"}
    </RcButton>)}
    {aim.listable && <RcButton variant="quiet" size="xs" className={PILL} aria-label="List the options" aria-expanded={aim.panel === "options"} onClick={() => aim.toggle("options")}>List</RcButton>}
    {!decision && effects.toggle}
    {aim.back && <RcButton variant="quiet" size="xs" className={PILL} onClick={aim.back}>Back</RcButton>}
    <RcButton size="xs" className={PILL} disabled={!selected || targetBase !== selectedBase} onClick={confirmMagic}>Confirm</RcButton>
    {!pending.cpuEvent && <RcButton variant="quiet" size="xs" className={PILL} disabled={!!pending.cpuRandomMinion} onClick={cancelMagic}>Cancel</RcButton>}
  </Shell>;
}

/** Deck-order prompt: the next spells as card art in draw order, plus Keep on top / Put on bottom when the effect allows it. */
function ReorderAssist({header,choices,spellbook,cpuChoice,setCpuMagicChoice,confirmMagic}: {
  header: ReactNode; choices: SpellChoice[]; spellbook: CardRef[]; cpuChoice?: string;
  setCpuMagicChoice: (key: string) => void; confirmMagic: () => void;
}) {
  const ops = choices.map(reorderOf);
  const count = Math.max(0,...ops.map(op => op && !op.bottom ? op.order.length : 0));
  const cards = spellbook.slice(0,count);
  const current = ops[choices.findIndex(choice => choice.key === cpuChoice)] ?? null;
  const bottom = !!current?.bottom, canBottom = ops.some(op => op?.bottom);
  const order = current && !current.bottom ? current.order : cards.map((_,index) => index);
  const pick = (next: number[], toBottom: boolean) => {
    const key = choices.find((_,index) => { const op = ops[index]; return !!op && !!op.bottom === toBottom && (toBottom || op.order.join("-") === next.join("-")); })?.key;
    if (key) setCpuMagicChoice(key);
  };
  // Confirming untouched cards keeps them in their current order.
  const confirm = () => { if (!current) pick(order,false); confirmMagic(); };
  return <Shell below={<CpuCardOrder cards={cards} order={order} onOrder={next => pick(next,false)} label={bottom ? () => "bottom of your spellbook" : undefined}>
    {canBottom && <div role="group" aria-label="Where it goes" className="mt-3 flex justify-center gap-2">
      <RcButton variant="quiet" size="xs" aria-pressed={!bottom} onClick={() => pick(order,false)}>Keep on top</RcButton>
      <RcButton variant="quiet" size="xs" aria-pressed={bottom} onClick={() => pick(order,true)}>Put on bottom</RcButton>
    </div>}
  </CpuCardOrder>}>
    {header}
    <span aria-live="polite" className="text-rc-fg-muted">· {cards.length > 1 ? "drag a card, or click two to swap · 1st is drawn first" : "keep it on top or put it on the bottom"}</span>
    <RcButton size="xs" className={PILL} onClick={confirm}>Confirm</RcButton>
  </Shell>;
}

// The combat HUD's attack-choice bars own the same top slot and precede any pendingCombat, so targeting gives way to them.
const selectAbilityView = (state: GameState) => ({matchEnded:state.matchEnded,activateCpuAbility:state.activateCpuAbility,
  combatBar:!!(state.attackChoice || state.attackTargetChoice || state.attackConfirm)});

const sourceTile = (choice: AbilityChoice) => choice.source.at;

/** Targeting for the source picked from CpuAbilityButtons (next to Attack here): nothing shows until a source is picked,
 * and a hovered button only lights its source's tile. */
function AbilityAssist() {
  const {matchEnded,activateCpuAbility,combatBar} = useGameStore(useShallow(selectAbilityView));
  const {actorKey,request,choices,sources} = useReadyAbilities();
  const picked = useCpuAbilityPicker(state => state.request === request ? state.picked : null);
  const hovered = useCpuAbilityPicker(state => state.request === request ? state.hovered : null);
  const active = picked && sources.some(([id]) => id === picked) ? picked : null;
  // A pick from another turn, or of a source that no longer offers an ability, is dropped rather than coming back later.
  useEffect(() => {
    const picker = useCpuAbilityPicker.getState();
    if (picker.request !== request ? picker.picked || picker.hovered : picker.picked && !active) picker.clear();
  },[request,picked,active]);
  const own = useMemo(() => active && !combatBar ? choices.filter(choice => abilitySourceId(choice) === active) : NO_ABILITIES,[choices,active,combatBar]);
  const lit = !active && !combatBar && hovered ? sources.find(([id]) => id === hovered)?.[1].at : undefined;
  const aim = useTargeting({session:`${request}|${active}|${own.map(baseOf).join(" ")}`,choices:own,casterTile:sourceTile,active:!!active,
    sources:active ? undefined : lit ? [lit] : []});
  const leave = useCallback(() => useCpuAbilityPicker.getState().pick(request,null),[request]);
  useEscape(combatBar ? null : aim.back ?? (active ? leave : null));
  if (!actorKey || matchEnded || !active || combatBar) return null;
  const {view} = aim, text = instruction(view,actorKey), effects = effectList(aim,own), source = sources.find(([id]) => id === active)?.[1];
  return <Shell below={effects.list}>
    <span className={NAME}>{source?.card.name}</span>
    {text && <span aria-live="polite" className="text-rc-fg-muted">· {text}</span>}
    {view.target && <span className={CHIP} title={view.target.label}>{view.target.label}</span>}
    {effects.toggle}
    <RcButton variant="quiet" size="xs" className={PILL} onClick={aim.back ?? leave}>Back</RcButton>
    <RcButton size="xs" className={PILL} disabled={!view.target} onClick={() => { if (view.target) activateCpuAbility(view.target.key); leave(); }}>Resolve</RcButton>
  </Shell>;
}

const selectTriggers = (state: GameState) => ({triggers:state.cpuTriggerOptions?.length ? state.cpuTriggerOptions : NO_TRIGGERS,chooseCpuTrigger:state.chooseCpuTrigger});

/** Simultaneous triggers as the cards that caused them, in the listed order: click one to resolve it next. */
function TriggerAssist() {
  const {triggers,chooseCpuTrigger} = useGameStore(useShallow(selectTriggers));
  // Dismissing (close or Escape) keeps the listed order; mandatory triggers are never skipped.
  const inOrder = useCallback(() => chooseCpuTrigger(CPU_TRIGGERS_IN_ORDER),[chooseCpuTrigger]);
  useEscape(inOrder);
  const items = useMemo(() => triggers.map(({id,label,card,badge}): CardPickItem => card ? {id,card,badge} : {id,card:{name:label},label}),[triggers]);
  return <Shell below={<CpuCardPick title="Triggers" items={items} onPick={chooseCpuTrigger} onClose={inOrder} />}>
    <span className={NAME}>Choose the next trigger to resolve</span>
    <span className="hidden text-sm text-rc-fg-muted lg:inline">· click a card, or close to keep this order</span>
  </Shell>;
}

const selectMode = (state: GameState) => state.pendingMagic?.spell.card.name ? "spell" : state.actorKey && !state.matchEnded && state.cpuTriggerOptions?.length ? "trigger" : "ability";

/** CPU-match assistant: one slim bar at the top of the screen for spells, CPU prompts, trigger order and
 * activated abilities, with targets clicked on the board (CpuFieldTargets) and cards picked by their art instead of lists. */
export default function CpuAssistBar() {
  const mode = useGameStore(selectMode);
  return mode === "spell" ? <SpellAssist /> : mode === "trigger" ? <TriggerAssist /> : <AbilityAssist />;
}

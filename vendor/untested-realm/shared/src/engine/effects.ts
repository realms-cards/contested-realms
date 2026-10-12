// Effect primitives shared by engine flows and card scripts, plus the
// prompt/continuation machinery that lets effects pause for player decisions.

import { getCard, getKeywords, findCard } from '../cards/db'
import { getScript, type DamageSource, type EffectAPI, type TargetRef, type TargetSpec } from '../cards/scripts/registry'
import type { GameState, PlayerId, Region, UnitState, SiteState, Prompt, DeckName } from './types'
import { avatarOf, siteAt, unitsAt, edgesConnected, aura2x2Squares, occupiedSquares, inBounds, GRID_W, GRID_H, squareLabel, nearbySquaresW, orthAdjacentWrapped } from './grid'
import { affinity, effAttack, effDefence, effKeywords, canExistIn, siteSilenced, artifactSilenced, artScript, isEvilUnit, isDisabled, isUnmodifiable, silenceImmune, footprintAllTerrain, terrainAt, buildStaticGrantIndex, isVoidAt } from './statics'
import { siteEntryAllowed } from './movement' // runtime-only use (teleport closure); import cycle is safe
import { awardAchievement } from './achievements.catalog' // types-only module → no cycle

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`
}

export function pushLog(state: GameState, player: PlayerId | null, msg: string): void {
  state.log.push({ turn: state.turn, player, msg })
}

export function opponent(p: PlayerId): PlayerId {
  return (1 - p) as PlayerId
}

// ---- area-damage reveal (a numbered grid shown to BOTH players after a multi-location
//      damage spell resolves, then fades). Accumulated in state.flow.areaReveal so it syncs
//      to both seats via the view; the client animates it when `seq` changes. ----
/** Start a fresh capture for the current cast/ability (clears cells, keeps element). Called
 *  at the top of castSpell / activateAbility so cross-action damage never leaks in. */
export function beginAreaReveal(state: GameState, element?: string, name?: string, casterId?: string, spell?: boolean): void {
  state.flow = state.flow ?? {}
  const prev = state.flow.areaReveal
  state.flow.areaReveal = {
    cells: [], redSites: [], element: element ?? 'none',
    name: name ?? '', casterId: casterId ?? '', spell: !!spell, ability: false, shoots: false, seq: prev?.seq ?? 0, open: true,
  }
}
/** Mark the open reveal as a projectile "shot" (fired by fireVolley/firePerSquare/firstProjectileImpact
 *  or the built-in Ranged). Only changes the ABILITY caption ("<card> shoots!"); ignored for spells. */
export function markRevealShoots(state: GameState): void {
  const rev = state.flow?.areaReveal
  if (rev && rev.open) rev.shoots = true
}
/** Record damaged squares for the reveal (printed cells from applyGrid, or projectile hits).
 *  Bumps `seq` so the client detects a new reveal once damage actually lands. */
export function recordAreaReveal(state: GameState, cells: { x: number; y: number; dmg: number }[], element?: string): void {
  const rev = state.flow?.areaReveal
  if (!rev || !rev.open || !cells.length) return
  for (const c of cells) rev.cells.push({ x: c.x, y: c.y, dmg: c.dmg })
  if (element && rev.element === 'none') rev.element = element
  rev.seq++
}
/** Record the sites a single-target spell AFFECTS (a targeted unit's/artifact's site, or a
 *  targeted site). The client glows them red and captions them with the spell name. Bumps
 *  `seq` so the reveal fires. (Area-damage spells target squares, not units, so they never
 *  populate this — the two reveal styles stay mutually exclusive.) */
export function recordAffectedSites(state: GameState, sites: { x: number; y: number }[]): void {
  const rev = state.flow?.areaReveal
  if (!rev || !rev.open || !sites.length) return
  for (const s of sites) if (!rev.redSites.some((r: { x: number; y: number }) => r.x === s.x && r.y === s.y)) rev.redSites.push({ x: s.x, y: s.y })
  rev.seq++
}
/** A unit's/artifact's mutable "was I affected?" signature: position, region, tapped, damage,
 *  life, controller, name (transforms), silence/ward/stealth/death's-door, carrier, and modifier
 *  count (buffs/debuffs). Any change means a spell touched it. */
function realmSig(e: any): string {
  return [
    e.x, e.y, e.region ?? '', e.tapped ? 1 : 0, e.damage ?? 0, e.life ?? '', e.controller,
    e.name, e.silenced ? 1 : 0, e.ward ? 1 : 0, e.stealth ? 1 : 0, e.deathsDoor ? 1 : 0,
    e.flipped ? 1 : 0, e.carriedBy ?? '', e.conjuredBy ?? '', (e.modifiers?.length ?? 0),
    (e.carrying?.length ?? 0), (e.carryingUnits?.length ?? 0),
  ].join('|')
}
export interface RealmSnapshot { sigs: Map<string, string>; pos: Map<string, { x: number; y: number }> }
/** Snapshot every unit + artifact before a spell resolves, for the "what did it touch" diff. */
export function snapshotRealm(state: GameState): RealmSnapshot {
  const sigs = new Map<string, string>()
  const pos = new Map<string, { x: number; y: number }>()
  for (const u of Object.values(state.units)) { sigs.set(u.id, realmSig(u)); pos.set(u.id, { x: u.x, y: u.y }) }
  for (const a of Object.values(state.artifacts)) { sigs.set(a.id, realmSig(a)); pos.set(a.id, { x: a.x, y: a.y }) }
  return { sigs, pos }
}
/** Glow the site of every unit/artifact that a spell CHANGED (buffs, taps, transforms, moves…)
 *  REMOVED (killed / banished / bounced), or NEWLY CREATED (a summoned token / conjured artifact —
 *  Border Militia's Foot Soldiers glow at the sites they appear). Covers effects with no explicit
 *  target and no damage (Witching Hour buffs, summons). */
export function recordTouchedSites(state: GameState, snap: RealmSnapshot): void {
  const affected: { x: number; y: number }[] = []
  for (const [id, sig] of snap.sigs) {
    const ent = state.units[id] ?? state.artifacts[id]
    if (!ent) { const p = snap.pos.get(id); if (p) affected.push(p) } // removed → its last site
    else if (realmSig(ent) !== sig) affected.push({ x: ent.x, y: ent.y }) // changed → current site
  }
  // NEW entities the spell created (summons / conjures) — glow where they landed
  for (const u of Object.values(state.units)) if (!u.isAvatar && !snap.sigs.has(u.id)) affected.push({ x: u.x, y: u.y })
  for (const a of Object.values(state.artifacts)) if (!snap.sigs.has(a.id)) affected.push({ x: a.x, y: a.y })
  if (affected.length) recordAffectedSites(state, affected)
}
/** A whole-realm signature used to decide whether a triggered ability (e.g. an end-of-turn trigger)
 *  ACTUALLY did anything — so an idle trigger doesn't flash an animation every turn. Covers every
 *  observable change: units + artifacts (via realmSig), site control/state, aura control/footprint,
 *  each player's mana + zone sizes, and the log/prompt lengths (a logged or interactive effect). */
export function turnFingerprint(state: GameState): string {
  const parts: string[] = [`L${state.log.length}`, `P${state.prompts.length}`]
  for (const u of Object.values(state.units)) parts.push(`u${u.id}:${realmSig(u)}`)
  for (const a of Object.values(state.artifacts)) parts.push(`a${a.id}:${realmSig(a)}`)
  for (const s of Object.values(state.sites)) parts.push(`s${s.id}:${s.controller}/${s.isRubble ? 1 : 0}/${s.flooded ? 1 : 0}/${s.ward ? 1 : 0}/${s.tapped ? 1 : 0}/${s.name}`)
  for (const r of Object.values(state.auras)) parts.push(`r${r.id}:${r.controller}/${r.squares?.length ?? 0}/${r.name}`)
  for (const p of state.players) parts.push(`p${p.id}:${p.mana}/${p.hand.length}/${p.spellbook.length}/${p.atlas.length}/${p.cemetery.length}/${p.banished.length}/${p.established ? 1 : 0}`)
  return parts.join('|')
}
/** Always fire the cast reveal for a magic — bump seq once at the end so the golden caster + spell
 *  name show even when the spell touched no unit/site/artifact (a card draw, a mana spell…). */
export function sealSpellReveal(state: GameState): void {
  const rev = state.flow?.areaReveal
  if (rev && rev.open && rev.spell) rev.seq++
}
/** Seal the already-open reveal for an ACTIVATED ability so it animates like a spell cast: golden
 *  caster + the given writing + a site glow. Preserves any damage grid / affected sites the effect
 *  recorded; if it touched nothing, the caster's OWN site is lit so there's always a site animation. */
export function sealAbilityReveal(state: GameState, name?: string): void {
  const rev = state.flow?.areaReveal
  if (!rev || !rev.open) return
  rev.ability = true
  if (name) rev.name = name
  if (!rev.cells.length && !rev.redSites.length) {
    const src = state.units[rev.casterId] ?? state.artifacts[rev.casterId] ?? state.sites[rev.casterId]
    if (src && typeof src.x === 'number') rev.redSites.push({ x: src.x, y: src.y })
  }
  rev.seq++
}
/** Open + seal a one-shot ability reveal in a single call (for actions with no pre-opened capture,
 *  e.g. the avatar playing/drawing a site). Lights `site` (or the caster's own square) and writes `text`. */
export function revealAbility(state: GameState, casterId: string, text: string, site?: { x: number; y: number }): void {
  beginAreaReveal(state, undefined, text, casterId, false)
  const rev = state.flow?.areaReveal
  if (!rev) return
  rev.ability = true
  const src = state.units[casterId] ?? state.artifacts[casterId] ?? state.sites[casterId]
  const at = site ?? (src && typeof src.x === 'number' ? { x: src.x, y: src.y } : null)
  if (at) recordAffectedSites(state, [at])
  else rev.seq++
}

// ---- battle reveal (a two-sided panel shown to BOTH players after a battle resolves, then
//      fades). Battles are ASYNC (defend / allocate-damage prompts), so we stash a snapshot in
//      flow.pendingBattle at declare-time and finalise it at fireAfterAttack. ----
/** Snapshot the realm + battle site + log position when an attack is declared. Serializable
 *  (plain object) so it survives the defend/allocate prompts. */
export function beginBattleCapture(state: GameState, attacker: UnitState, loc: { x: number; y: number }, targetId?: string): void {
  state.flow = state.flow ?? {}
  const site = Object.values(state.sites).find((s) => s.x === loc.x && s.y === loc.y && !s.isRubble)
  const before: Record<string, { sig: string; damage: number; life: number; controller: PlayerId; name: string }> = {}
  for (const u of Object.values(state.units)) {
    before[u.id] = { sig: realmSig(u), damage: u.damage ?? 0, life: u.life ?? 0, controller: u.controller, name: u.name }
  }
  state.flow.pendingBattle = { attackerId: attacker.id, attackerPlayer: attacker.controller, targetId, site: site?.name ?? '', logMark: state.log.length, before }
}
/** Finalise the battle reveal: every unit that took damage / died / was otherwise affected,
 *  split into the attacker side and the defender side, plus every log line the battle emitted.
 *  The attacker is always shown. Clears pendingBattle. */
export function finishBattleCapture(state: GameState): void {
  const pb = state.flow?.pendingBattle
  if (!pb) return
  // The battle isn't over while a mid-battle prompt is still open (a damage-prevention ordering prompt,
  // a Royal Bodyguard redirect, a Stitched Abomination part pick…). DEFER the reveal — leave pendingBattle
  // intact and let the applyAction boundary finalise it once the prompt queue drains, so the "Battle of X"
  // panel appears only after the battle truly ends and its snapshot reflects the final board.
  if (state.prompts.length > 0) return
  state.flow.pendingBattle = undefined
  type Entry = { name: string; died: boolean; dmg: number }
  const attackers: Entry[] = []
  const defenders: Entry[] = []
  for (const id of Object.keys(pb.before)) {
    const b = pb.before[id]
    const side = b.controller === pb.attackerPlayer ? attackers : defenders
    const u = state.units[id]
    if (!u) { side.push({ name: b.name, died: true, dmg: 0 }); continue } // died / left
    if (realmSig(u) === b.sig && id !== pb.attackerId && id !== pb.targetId) continue // untouched — but always show the attacker AND the attacked target (even if fully prevented)
    const dmg = u.isAvatar ? Math.max(0, b.life - (u.life ?? 0)) : Math.max(0, (u.damage ?? 0) - b.damage)
    side.push({ name: u.name, died: false, dmg })
  }
  const prev = state.flow.battleReveal
  state.flow.battleReveal = {
    seq: (prev?.seq ?? 0) + 1,
    site: pb.site,
    attackers, defenders,
    logs: state.log.slice(pb.logMark).map((e) => e.msg),
  }
}

// ---- kill credit (rulebook): who gets credit for a kill, priority 1 (strike / ability damage)
//      > 2 (a Magic the unit cast) > 3 (an activated/triggered ability). Priority 1 is tracked
//      per-victim in flow.damageCredit (see dealDamageToUnit); priorities 2 & 3 are an AMBIENT
//      context set around a magic's / ability's resolution. Only UNITS get credit. ----
export interface ActionCredit { priority: number; unitIds: string[] }
/** Set the ambient action-credit (priority 2 for a magic, 3 for an ability) for the duration of
 *  that action; returns the previous value to restore afterwards. Empty unit set → keep the outer
 *  context (a spell cast by an artifact, a site ability… no unit to credit at this level). */
export function setActionCredit(state: GameState, priority: number, unitIds: string[]): ActionCredit | null {
  state.flow = state.flow ?? {}
  const prev: ActionCredit | null = state.flow.actionCredit ?? null
  const ids = unitIds.filter((id) => state.units[id])
  if (ids.length) state.flow.actionCredit = { priority, unitIds: ids }
  return prev
}
export function restoreActionCredit(state: GameState, prev: ActionCredit | null): void {
  state.flow = state.flow ?? {}
  state.flow.actionCredit = prev ?? undefined
}
/** "X" | "X and Y" | "X, Y and Z" */
export function joinNames(names: string[]): string {
  const u = [...new Set(names.filter(Boolean))]
  if (u.length <= 1) return u[0] ?? ''
  if (u.length === 2) return `${u[0]} and ${u[1]}`
  return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`
}

/** Record mana a player spends this turn, so the UI can show remaining/total mana
 *  (total = remaining + spent). Reset each turn in finishBeginTurn. */
export function bumpManaSpent(state: GameState, player: PlayerId, n: number): void {
  if (n <= 0) return
  state.flow = state.flow ?? {}
  state.flow.manaSpent = state.flow.manaSpent ?? { 0: 0, 1: 0 }
  state.flow.manaSpent[player] = (state.flow.manaSpent[player] ?? 0) + n
}

/** Record that `amount` mana was just PROVIDED by a source at (x,y,region), so the client can
 *  float a "+n 🔮" over it for ~1s. A rolling, seq-stamped list (synced to both seats — mana
 *  sources are public); the client animates every entry whose seq it hasn't shown yet, so a
 *  start-of-turn burst (many sites at once) and a single tap both animate correctly. */
export function recordManaGain(state: GameState, x: number, y: number, region: Region, amount: number): void {
  if (amount <= 0) return
  state.flow = state.flow ?? {}
  const seq = (state.flow.manaGainSeq ?? 0) + 1
  state.flow.manaGainSeq = seq
  state.flow.manaGains = [...(state.flow.manaGains ?? []), { x, y, region, amount, seq }].slice(-24)
}

/** Record that a source at (x,y) just reached `level`, so the client can float a green
 *  "level N" over it for ~3s. Same seq-stamped, both-seats-synced pattern as recordManaGain
 *  (levels are public). The client animates every entry whose seq it hasn't shown yet. */
export function recordLevelUp(state: GameState, x: number, y: number, level: number): void {
  state.flow = state.flow ?? {}
  const seq = (state.flow.levelUpSeq ?? 0) + 1
  state.flow.levelUpSeq = seq
  state.flow.levelUps = [...(state.flow.levelUps ?? []), { x, y, level, seq }].slice(-24)
}

/** Record a "ticker" trigger at (x,y) so the client can flash `text` (solid black, white-bordered)
 *  over the source each time it fires — the Doomsday Device counting down. Seq-stamped + both-seats
 *  synced like recordLevelUp (a public event). */
export function recordTick(state: GameState, x: number, y: number, text: string): void {
  state.flow = state.flow ?? {}
  const seq = (state.flow.tickSeq ?? 0) + 1
  state.flow.tickSeq = seq
  state.flow.ticks = [...(state.flow.ticks ?? []), { x, y, text, seq }].slice(-24)
}

/** Record a multi-step walk so the client can animate the unit stepping square-by-square (dwelling in
 *  each visited square). Seq-stamped + synced to both seats — movement is public info. `squares` is the
 *  ordered list of locations the unit occupied (start … destination). */
export function recordMoveAnim(state: GameState, unitId: string, name: string, squares: { x: number; y: number; region: Region }[]): void {
  if (squares.length < 2) return
  state.flow = state.flow ?? {}
  const seq = (state.flow.moveSeq ?? 0) + 1
  state.flow.moveSeq = seq
  state.flow.moveAnim = [...(state.flow.moveAnim ?? []), { unitId, name, squares, seq }].slice(-8)
}

/** Record a genuine teleport (Blink, Swap, …) so the client can zap the card out of its old square and
 *  glow the destination. Seq-stamped + synced — teleports are public. Push/pull one-steppers don't call
 *  this (they read as a shove, not a blink). */
export function recordTeleport(state: GameState, unitId: string, name: string, from: { x: number; y: number }, to: { x: number; y: number }): void {
  state.flow = state.flow ?? {}
  const seq = (state.flow.teleSeq ?? 0) + 1
  state.flow.teleSeq = seq
  state.flow.teleportAnim = [...(state.flow.teleportAnim ?? []), { unitId, name, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, seq }].slice(-8)
}

/** Record a card being ripped/torn to pieces, so BOTH clients play a big centre-screen tear
 *  animation (Erik's Curiosa). Public event (the ripped card is revealed), seq-stamped like the
 *  other reveals; the client fires it once per new seq. */
export function recordRip(state: GameState, name: string, by: PlayerId): void {
  state.flow = state.flow ?? {}
  const seq = (state.flow.ripSeq ?? 0) + 1
  state.flow.ripSeq = seq
  state.flow.rip = { name, by, seq }
}

/** where a card sits, for floating its mana-gain indicator (carried artifact → its bearer). */
function sourceSquare(state: GameState, sourceId: string): { x: number; y: number; region: Region } | null {
  const u = state.units[sourceId]
  if (u) return { x: u.x, y: u.y, region: u.region }
  const s = state.sites[sourceId]
  if (s) return { x: s.x, y: s.y, region: 'surface' }
  const a = state.artifacts[sourceId]
  if (a) {
    const bearer = a.carriedBy ? state.units[a.carriedBy] : null
    if (bearer) return { x: bearer.x, y: bearer.y, region: bearer.region }
    return { x: a.x, y: a.y, region: a.region }
  }
  return null
}

/** Add mana to a player AND (if a source location is known) float a "+n" over it. */
export function gainMana(state: GameState, player: PlayerId, amount: number, at?: { x: number; y: number; region: Region }): void {
  state.players[player].mana += amount
  if (at) recordManaGain(state, at.x, at.y, at.region, amount)
}

/** is this unit protected from Magic damage/targeting? (own script or carried artifact) */
export function isMagicProtected(state: GameState, unit: UnitState): boolean {
  const check = (name: string, id: string): boolean => {
    const p = getScript(name)?.magicProtected
    if (p === true) return true
    if (typeof p === 'function') return p(state, id, unit)
    return false
  }
  if (!unit.silenced && check(unit.name, unit.id)) return true
  for (const artId of unit.carrying) {
    const art = state.artifacts[artId]
    if (art && check(art.name, art.id)) return true
  }
  // ground artifacts in the realm can protect other units by position (Arcade of Bones: Undead in
  // its row). The hook decides who it covers; we just need to consult every non-silenced artifact.
  for (const art of Object.values(state.artifacts)) {
    if (art.carriedBy) continue // carried ones are covered by the loop above (their bearer's carrying)
    if (!artifactSilenced(state, art) && check(art.name, art.id)) return true
  }
  return false
}

/** seeded random pick that advances the game seed (deterministic replays) */
export function randPick<T>(state: GameState, arr: T[]): T | null {
  if (arr.length === 0) return null
  const rnd = mulberry32(state.seed)
  const idx = Math.floor(rnd() * arr.length)
  state.seed = Math.floor(rnd() * 0xffffffff)
  return arr[idx]
}

/** seeded random index in [0, n) that advances the game seed */
export function randIndex(state: GameState, n: number): number {
  const rnd = mulberry32(state.seed)
  const idx = Math.floor(rnd() * n)
  state.seed = Math.floor(rnd() * 0xffffffff)
  return idx
}

/** who (if anyone) gets to determine a random outcome that belongs to forPlayer.
 *  Kythera Mechanism: bearer's controller determines ALL random outcomes.
 *  Black Cat: determines the opponent's random outcomes. */
export function randomDeterminer(state: GameState, forPlayer: PlayerId): PlayerId | null {
  for (const art of Object.values(state.artifacts)) {
    if (art.name === 'Kythera Mechanism' && art.carriedBy) {
      const bearer = state.units[art.carriedBy]
      if (bearer) return bearer.controller
    }
  }
  for (const u of Object.values(state.units)) {
    if (u.name === 'Black Cat' && !u.silenced && u.controller !== forPlayer) return u.controller
  }
  return null
}

/** Lucky Charm: bearer's controller determines their random outcomes an extra time
 *  and picks one. Each charm adds ONE extra determination, so N charms ⇒ choose from
 *  N+1 candidates (no FAQ on stacking; this is the natural reading of the card). */
export function luckCount(state: GameState, forPlayer: PlayerId): number {
  let n = 0
  for (const art of Object.values(state.artifacts)) {
    if (art.name === 'Lucky Charm' && art.carriedBy && state.units[art.carriedBy]?.controller === forPlayer) n++
  }
  return n
}
export function isLucky(state: GameState, forPlayer: PlayerId): boolean {
  return luckCount(state, forPlayer) > 0
}

export type LuckyOption = { label: string; payload: unknown }
export type LuckyResult =
  | { choose: false; payload: unknown }
  | { choose: true; chooser: PlayerId; options: LuckyOption[] }

/**
 * Decide how a single random outcome that belongs to `forPlayer` resolves, honoring
 * both randomness-bending statics at once:
 *  - Kythera Mechanism / Black Cat (`randomDeterminer`): the determiner freely CHOOSES
 *    among ALL options.
 *  - Lucky Charm (`luckCount`): roll count+1 DISTINCT candidates; forPlayer chooses one.
 * PURE (only advances the seed for the plain/roll cases) — no prompt is pushed. The
 * caller either applies `payload` directly (`choose:false`) or presents `options` to
 * `chooser` via its own prompt (`ctx.ask` for cards, `pushPrompt` for engine effects)
 * and applies the chosen payload in the continuation (use `luckyChoiceIndex`).
 */
export function luckyCandidates(state: GameState, forPlayer: PlayerId, options: LuckyOption[]): LuckyResult {
  if (options.length === 0) return { choose: false, payload: undefined }
  if (options.length === 1) return { choose: false, payload: options[0].payload }
  const determiner = randomDeterminer(state, forPlayer)
  if (determiner !== null) return { choose: true, chooser: determiner, options } // pick any
  const k = luckCount(state, forPlayer)
  if (k <= 0) return { choose: false, payload: options[randIndex(state, options.length)].payload } // plain random
  const pool = [...options]
  const picked: LuckyOption[] = []
  const want = Math.min(k + 1, pool.length)
  while (picked.length < want) picked.push(pool.splice(randIndex(state, pool.length), 1)[0])
  if (picked.length <= 1) return { choose: false, payload: picked[0].payload }
  return { choose: true, chooser: forPlayer, options: picked }
}

/** recover the chosen index from a lucky prompt answer (chooseCards → [idx];
 *  chooseOption → the label string, matched against `__labels` stored in the cont ctx) */
export function luckyChoiceIndex(ctx: { __labels?: string[] }, choice: unknown): number {
  if (Array.isArray(choice)) return typeof choice[0] === 'number' ? choice[0] : 0
  if (typeof choice === 'number') return choice
  if (typeof choice === 'string' && Array.isArray(ctx.__labels)) {
    const i = ctx.__labels.indexOf(choice)
    return i >= 0 ? i : 0
  }
  return 0
}

import { mulberry32 } from './rng'
import { syncCarried, detachFromCarrier, dropAllCarriedUnits } from './carrying'

// ---- prompts & continuations ----

type ContFn = (state: GameState, ctx: any, choice: any) => void
const continuations = new Map<string, ContFn>()

export function registerCont(key: string, fn: ContFn): void {
  continuations.set(key, fn)
}

/** invoke a registered continuation directly (no prompt) — used to chain a
 *  follow-up step after an engine-driven cast resolves (Chaoswish's copy chain).
 *  Unknown keys are a no-op so a stale afterKey can never crash a game. */
export function runCont(state: GameState, key: string, ctx: any, choice: any = null): void {
  const fn = continuations.get(key)
  if (fn) fn(state, ctx, choice)
}

/**
 * Deferred turn steps: a continuation that must run only AFTER the current prompt
 * chain has fully drained. The prompt queue is FIFO and conts append to its back,
 * so a naive "fire trigger, then advance the turn" sequence would interleave the
 * turn's next step (e.g. the draw prompt) ahead of a trigger's nested follow-up
 * prompt (e.g. the Seer's keep/bottom choice). Parking that next step here and
 * running it only once `state.prompts` empties preserves the correct order:
 * every start-/end-of-turn decision resolves before the turn moves on.
 */
export function deferTurnStep(state: GameState, cont: string, ctx: any): void {
  state.flow = state.flow ?? {}
  ;(state.flow.turnSteps = state.flow.turnSteps ?? []).push({ cont, ctx })
}

/** Drain parked turn steps while no prompt is pending. A step may push its own
 *  prompt (e.g. the draw prompt), which stops the drain until that too resolves. */
export function runTurnSteps(state: GameState): void {
  let guard = 0
  while (state.prompts.length === 0 && state.flow?.turnSteps?.length && guard++ < 64) {
    const step = state.flow.turnSteps.shift()
    const fn = continuations.get(step.cont)
    if (fn) fn(state, step.ctx, null)
    checkStateBased(state)
  }
}

function discardAt(state: GameState, player: PlayerId, idx: number): void {
  const p = state.players[player]
  const [id] = p.hand.splice(idx, 1)
  if (id === undefined) return
  toCemetery(state, id) // honor Mismanaged Mortuary / Kor Crematory
  pushLog(state, player, `${p.name} discards ${state.cards[id].name}.`)
}
function discardCardId(state: GameState, player: PlayerId, id: string): void {
  const idx = state.players[player].hand.indexOf(id)
  if (idx >= 0) discardAt(state, player, idx)
}
/**
 * Hand card ids that are SPELLS — i.e. everything that is not a Site.
 * Rulebook: "Any card in your hand that is not a site is a spell." A player's
 * hand holds both spells and sites (sites are drawn from the atlas). Card texts
 * that say "discard/cast/reveal a spell" must never offer a site; texts that say
 * "a card" (or "a random card") may offer the whole hand. The hand never holds
 * Avatars, so a simple type !== 'Site' filter is sufficient.
 */
export function spellHandIds(state: GameState, player: PlayerId): string[] {
  return state.players[player].hand.filter((id) => getCard(state.cards[id].name).type !== 'Site')
}
/** A card LOCKED to a specific caster (Morgana's own 3 spells, an Omphalos's element spells…): it sits
 *  in the hand but ONLY that caster may cast it — so it is not a free part of your hand. A generic
 *  "discard a card" (Troll Bridge's toll, Legion of Gall, a random discard) must never offer/consume it. */
export function isCasterLocked(state: GameState, cardId: string): boolean {
  return ((state.flow?.lockedCards ?? []) as { cardId: string }[]).some((e) => e.cardId === cardId)
}
/** A player's hand minus caster-locked cards — the pool any discard effect may touch (optionally spells only). */
export function discardableHandIds(state: GameState, player: PlayerId, spellsOnly = false): string[] {
  const base = spellsOnly ? spellHandIds(state, player) : [...state.players[player].hand]
  return base.filter((id) => !isCasterLocked(state, id))
}
// unified random-discard resolution (Kythera/Black Cat determiner OR Lucky Charm choice)
registerCont('random:discardChosen', (state, ctx: { player: PlayerId; __opts: string[]; __labels: string[] }, choice) => {
  const id = ctx.__opts[luckyChoiceIndex(ctx, choice)]
  if (typeof id === 'string') discardCardId(state, ctx.player, id)
})
// id-based resolution for ctx.discardChoose: the prompt's choice is INDICES into
// the candidate list (not the hand), so recover the captured card ids and discard
// them by id — robust even if the hand changed between ask and answer.
registerCont('effect:discardChosen', (state, ctx: { player: PlayerId; __ids: string[] }, choice) => {
  const idxs = (Array.isArray(choice) ? choice : [choice]).filter((i): i is number => typeof i === 'number')
  for (const i of idxs) {
    const id = ctx.__ids[i]
    if (typeof id === 'string') discardCardId(state, ctx.player, id)
  }
})
registerCont('site:redirect', (state, ctx: { siteId: string; n: number; sourcePlayer: PlayerId }, choice) => {
  const site = state.sites[ctx.siteId]
  if (!choice || !site) {
    if (site?.controller !== null && site) {
      loseLife(state, site.controller, ctx.n, false)
      emitEvent(state, 'onLifeLost', site.controller, ctx.n, { player: ctx.sourcePlayer, kind: 'effect' })
      pushLog(state, ctx.sourcePlayer, `${site.name} is struck for ${ctx.n}.`)
    }
    return
  }
  pushPrompt(state, {
    player: ctx.sourcePlayer,
    kind: 'chooseTargets',
    title: `Redirect ${ctx.n} damage to which unit?`,
    data: { candidates: Object.values(state.units).map((u) => u.id), count: 1, upTo: false, kind: 'unit' },
    cont: 'site:redirectTo',
    ctx,
  })
})
registerCont('site:redirectTo', (state, ctx: { n: number; sourcePlayer: PlayerId }, choice) => {
  const id = Array.isArray(choice) ? choice[0] : choice
  const u = typeof id === 'string' ? state.units[id] : null
  if (u) {
    dealDamageToUnit(state, u, ctx.n, ctx.sourcePlayer)
    checkStateBased(state)
  }
})
// Royal Bodyguard's "may take that damage instead". DECLINE → the original victim takes the hit. ACCEPT
// → the damage is ACCUMULATED onto the guard and dealt as ONE hit after every redirect choice in this
// (possibly simultaneous) event has been made — so a guard shielding both a King AND the Avatar soaks
// the whole total at once (it dies once, having protected both), instead of dying after the first.
// `noRedirect` stops it re-offering.
registerCont('guard:redirect', (state, ctx: { guardId: string; victimId: string; n: number; sourcePlayer: PlayerId; source: DamageSource; batch: boolean; lethal: boolean }, choice) => {
  const guard = state.units[ctx.guardId]
  const victim = state.units[ctx.victimId]
  if (!choice || !guard) {
    if (victim) {
      dealDamageToUnit(state, victim, ctx.n, ctx.sourcePlayer, { source: ctx.source, batch: ctx.batch, lethal: ctx.lethal, noRedirect: true })
      if (!ctx.batch) checkStateBased(state)
    }
    return
  }
  state.flow = state.flow ?? {}
  const acc = (state.flow.guardRedirect = state.flow.guardRedirect ?? {}) as Record<string, { total: number; sourcePlayer: PlayerId; source: DamageSource; lethal: boolean }>
  const first = !acc[ctx.guardId]
  const cur = acc[ctx.guardId] ?? { total: 0, sourcePlayer: ctx.sourcePlayer, source: ctx.source, lethal: false }
  cur.total += ctx.n
  cur.lethal = cur.lethal || ctx.lethal
  cur.sourcePlayer = ctx.sourcePlayer
  cur.source = ctx.source
  acc[ctx.guardId] = cur
  if (first) deferTurnStep(state, 'guard:applyRedirect', { guardId: ctx.guardId }) // apply the soaked total once, after all choices drain
  pushLog(state, guard.controller, `The Royal Bodyguard shields ${victim?.name ?? 'royalty'}!`)
})
// deal the whole soaked total to the guard in a single hit, once every redirect choice this event has resolved
registerCont('guard:applyRedirect', (state, ctx: { guardId: string }) => {
  const guard = state.units[ctx.guardId]
  const acc = state.flow?.guardRedirect?.[ctx.guardId]
  if (state.flow?.guardRedirect) delete state.flow.guardRedirect[ctx.guardId]
  if (!guard || !acc || acc.total <= 0) return
  dealDamageToUnit(state, guard, acc.total, acc.sourcePlayer, { source: acc.source, lethal: acc.lethal, noRedirect: true })
  checkStateBased(state)
})

/**
 * Ask `player` to arrange `ids` (revealed cards) into an order, then place the whole
 * group onto the `top` or `bottom` of `deck`. The answer is an index permutation whose
 * FIRST entry is the top-of-group: for 'top' that becomes the very next draw; for
 * 'bottom' the LAST entry becomes the absolute bottom of the deck (so it fully controls
 * e.g. Kelp Cavern's bottom-three). 0–1 cards need no prompt.
 */
export function askOrder(
  state: GameState,
  player: PlayerId,
  deck: 'spellbook' | 'atlas',
  ids: string[],
  place: 'top' | 'bottom',
  title: string,
): void {
  const zone = state.players[player][deck]
  if (ids.length === 0) return
  if (ids.length === 1) {
    if (place === 'top') zone.unshift(ids[0])
    else zone.push(ids[0])
    return
  }
  pushPrompt(state, {
    player,
    kind: 'orderCards',
    title,
    data: { cards: ids.map((id) => state.cards[id].name), place },
    cont: 'deck:order',
    ctx: { player, deck, ids, place },
  })
}
registerCont('deck:order', (state, ctx: { player: PlayerId; deck: 'spellbook' | 'atlas'; ids: string[]; place: 'top' | 'bottom' }, choice) => {
  const order: number[] = Array.isArray(choice) ? (choice as unknown[]).filter((i): i is number => typeof i === 'number') : []
  const seen = new Set<number>()
  const group: string[] = []
  for (const i of order) if (ctx.ids[i] !== undefined && !seen.has(i)) { seen.add(i); group.push(ctx.ids[i]) }
  for (let i = 0; i < ctx.ids.length; i++) if (!seen.has(i)) group.push(ctx.ids[i]) // any unplaced keep shown order, at the end
  const zone = state.players[ctx.player][ctx.deck]
  if (ctx.place === 'top') zone.unshift(...group)
  else zone.push(...group)
})

export function pushPrompt(state: GameState, prompt: Omit<Prompt, 'id'>): void {
  state.prompts.push({ ...prompt, id: newId(state, 'p') })
}

// "Second Seer" optional rule — the second player's granted start-of-turn peek. This is a
// SELF-CONTAINED engine effect with its own engine-level continuations: it deliberately does
// NOT route through the Seer avatar's card script (that coupled the peek's continuations to
// whatever avatar the player actually fielded, so answering the prompt looked up 'gaze'/'bottom'
// on the wrong script and died with "No continuation"). No card/script dependency now.
export function runSecondSeerPeek(state: GameState, player: PlayerId): void {
  const p = state.players[player]
  const options: string[] = []
  if (p.spellbook.length) options.push('peek at topmost spell')
  if (p.atlas.length) options.push('peek at topmost site')
  if (!options.length) return
  pushPrompt(state, {
    player,
    kind: 'chooseOption',
    title: 'Second Seer: gaze at which deck?',
    data: { options: [...options, '(neither)'] },
    cont: 'secondseer:gaze',
    ctx: { sourceId: '', controller: player, targets: [] },
  })
}

registerCont('secondseer:gaze', (state, ctx: { controller: PlayerId }, choice) => {
  if (typeof choice !== 'string' || choice === '(neither)') return
  const player = ctx.controller
  const deck: 'spellbook' | 'atlas' = choice.includes('spell') ? 'spellbook' : 'atlas'
  const top = state.players[player][deck][0]
  if (top === undefined) return
  pushPrompt(state, {
    player,
    kind: 'chooseOption',
    title: `Your topmost ${deck === 'spellbook' ? 'spell' : 'site'} — put it on the bottom?`,
    data: { options: ['keep on top', 'put on bottom'], reveal: state.cards[top].name },
    cont: 'secondseer:bottom',
    ctx: { sourceId: '', controller: player, targets: [], deck },
  })
})

registerCont('secondseer:bottom', (state, ctx: { controller: PlayerId; deck: 'spellbook' | 'atlas' }, choice) => {
  if (choice !== 'put on bottom') return
  const zone = state.players[ctx.controller][ctx.deck]
  const top = zone.shift()
  if (top !== undefined) zone.push(top)
  pushLog(state, ctx.controller, 'The Second Seer buries what they saw.')
})

/** For a straight-line directional effect (a roll / projectile / breath), the ordered lane of
 *  SURFACE-SITE squares from (x,y) outward in each cardinal direction — INCLUDING the start — up to
 *  the farthest square the effect can reach: it stops at the first void (siteless square) and stops
 *  BEFORE a site that blocks projectiles from entering (Impenetrable Copse, unless silenced). Powers
 *  both the direction-picker's conveyor preview (client) and Snowball's actual roll, so they always
 *  agree on where it stops. */
export function directionReach(state: GameState, x: number, y: number): Record<'n' | 's' | 'e' | 'w', { x: number; y: number }[]> {
  const deltas: Record<'n' | 's' | 'e' | 'w', [number, number]> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }
  const out = { n: [], s: [], e: [], w: [] } as Record<'n' | 's' | 'e' | 'w', { x: number; y: number }[]>
  const wrap = edgesConnected(state) // Magellan Globe: the lane continues off one edge onto the other
  for (const dir of ['n', 's', 'e', 'w'] as const) {
    const [dx, dy] = deltas[dir]
    let cx = x
    let cy = y
    const visited = new Set<string>()
    for (let guard = 0; guard < 64; guard++) {
      if (visited.has(`${cx},${cy}`)) break // wrapped all the way around the realm → stop
      const site = siteAt(state, cx, cy)
      if (!site) break // void (or off-board) → the lane ends
      // a projectile can't ENTER a blocking site from outside — stop just before it (the start
      // square is exempt: an effect beginning on/behind the cover isn't "entering" it)
      if ((cx !== x || cy !== y) && getScript(site.name)?.blocksProjectiles && !siteSilenced(state, site)) break
      visited.add(`${cx},${cy}`)
      out[dir].push({ x: cx, y: cy })
      cx += dx
      cy += dy
      if (!inBounds(cx, cy)) {
        if (!wrap) break // off the board and no Globe → the lane ends here
        cx = ((cx % GRID_W) + GRID_W) % GRID_W
        cy = ((cy % GRID_H) + GRID_H) % GRID_H
      }
    }
  }
  return out
}

export function activePrompt(state: GameState): Prompt | null {
  return state.prompts[0] ?? null
}

/** A chooseTargets prompt IS "targeting": an enemy warded pick breaks its ward and is dropped
 *  from the returned choice so the ability's continuation never affects it (rulebook Ward). Any
 *  non-warded or own-controlled pick passes through unchanged. Returns the choice in its original
 *  shape (array in → array out; scalar in → scalar out, or null when the sole pick was warded). */
function breakWardOnChosen(state: GameState, prompt: Prompt, choice: any): any {
  if (prompt.kind !== 'chooseTargets') return choice
  // `notTargeted`: a "choose/push/drag" selection that ISN'T targeting (River Rapids pushes a minion —
  // the rulebook Ward only reacts to actual targeting), so the pick is left untouched.
  if ((prompt.data as any)?.notTargeted) return choice
  const dataKind = (prompt.data as any)?.kind
  if (dataKind !== 'unit' && dataKind !== 'site') return choice
  const wasArray = Array.isArray(choice)
  const ids: any[] = wasArray ? choice : choice != null ? [choice] : []
  if (!ids.length) return choice
  const kept: any[] = []
  for (const id of ids) {
    const target = dataKind === 'unit' ? state.units[id as string] : state.sites[id as string]
    if (target && checkWard(state, target, prompt.player, target.controller, 'target')) {
      pushLog(state, prompt.player, `${target.name}'s ward breaks — the ability cannot touch it.`)
      continue
    }
    kept.push(id)
  }
  return wasArray ? kept : kept[0] ?? null
}

export function resolvePrompt(state: GameState, promptId: string, player: PlayerId, choice: any): string | null {
  const prompt = state.prompts[0]
  if (!prompt || prompt.id !== promptId) return 'That is not the active prompt.'
  if (prompt.player !== player) return 'This prompt is not yours to answer.'
  state.prompts.shift()
  // A cont is a continuation of the SAME card resolution the prompt interrupted, so its synchronous
  // segment is one simultaneous damage event too — a directional area spell (Lava Flow, Cone of Flame)
  // deals its whole blast in the cont AFTER the direction prompt, and must resolve every victim's
  // reduction/prevention before a single death settles, exactly like a spell that damages inline.
  let err: string | null = null
  runDamageEvent(state, () => {
    if (prompt.cont.startsWith('script:')) {
      // script:<cardName>:<key> — card names never contain ':', cont keys may
      // ('fc:strike', 'imposter:don'), so split at the FIRST separator
      const rest = prompt.cont.slice('script:'.length)
      const sep = rest.indexOf(':')
      const cardName = rest.slice(0, sep)
      const key = rest.slice(sep + 1)
      const script = getScript(cardName)
      const fn = script?.conts?.[key]
      if (!fn) { err = `No continuation ${prompt.cont}`; return }
      // __meta keeps magic-spell name routing and damage attribution alive
      // across chained prompts (Earthquake's swap loop, Ghostfire...)
      const ctx = makeCtx(state, prompt.ctx.sourceId ?? '', prompt.ctx.controller, prompt.ctx.targets ?? [], prompt.ctx.at, prompt.ctx.extra, prompt.ctx.__meta)
      // Codex: a Ward breaks when its bearer is TARGETED by an opponent's spell or ability. A
      // triggered/activated ability that picks its object through a chooseTargets prompt (Tooth
      // Faeries' start-of-turn tap, and every similar effect) is such targeting: an enemy warded
      // pick breaks its ward and is dropped from the choice, so the effect never touches it. (Own
      // picks and non-warded picks pass through untouched — checkWard's own-target guard sees to
      // that. Spell cast-targets already break ward earlier, on their own path.)
      fn(ctx, prompt.ctx, breakWardOnChosen(state, prompt, choice))
    } else {
      const fn = continuations.get(prompt.cont)
      if (!fn) { err = `No continuation ${prompt.cont}`; return }
      fn(state, prompt.ctx, choice)
    }
  })
  if (err) return err
  checkStateBased(state)
  runTurnSteps(state)
  return null
}

// ---- zones ----

/** A Magician-style avatar (noAtlasDraw) has no atlas — it can never draw sites.
 *  Any effect that would draw from the atlas simply does nothing for such a player. */
export function noAtlasDraw(state: GameState, player: PlayerId): boolean {
  const av = avatarOf(state, player)
  return !!(av && getScript(av.name)?.noAtlasDraw)
}

/** Avatars that must never be OFFERED a voluntary atlas draw: Magician (no atlas
 *  at all) and Pathfinder-style avatars (noStandardSiteAction — they can't play
 *  sites from hand, so a drawn site would be dead weight). Draw-choice prompts use
 *  this to auto-draw a spell instead of asking. */
export function noAtlasDrawChoice(state: GameState, player: PlayerId): boolean {
  const av = avatarOf(state, player)
  const s = av ? getScript(av.name) : undefined
  return !!(s?.noAtlasDraw || s?.noStandardSiteAction)
}

export function drawCards(state: GameState, player: PlayerId, deck: DeckName, n = 1): void {
  const p = state.players[player]
  // Magician (and any noAtlasDraw avatar) has no atlas: site draws are skipped
  // entirely — never a loss for an "empty" atlas, never a card gained.
  if (deck === 'atlas' && noAtlasDraw(state, player)) return
  for (let i = 0; i < n; i++) {
    // Garden of Eden: at most one spell draw per player per turn
    if (deck === 'spellbook' && state.turn > 0) {
      const eden = Object.values(state.sites).some(
        (s) => !s.isRubble && s.controller !== null && getScript(s.name)?.limitSpellDraws && !siteSilenced(state, s),
      )
      if (eden && (state.flow?.spellDraws?.[player] ?? 0) >= 1) {
        pushLog(state, player, 'The Garden of Eden permits no more spell draws this turn.')
        return
      }
      state.flow = state.flow ?? {}
      state.flow.spellDraws = state.flow.spellDraws ?? { 0: 0, 1: 0 }
      state.flow.spellDraws[player] = (state.flow.spellDraws[player] ?? 0) + 1
    }
    const id = p[deck].shift()
    if (id === undefined) {
      // drawing from an empty deck loses the game immediately
      state.winner = opponent(player)
      state.phase = 'over'
      pushLog(state, player, `${p.name} tried to draw from an empty ${deck} and loses!`)
      return
    }
    p.hand.push(id)
    // count SITE (atlas) draws this game — the bot uses it to guarantee it draws at least one site
    // in its first few turns (mana development)
    if (deck === 'atlas' && state.turn > 0) {
      state.flow = state.flow ?? {}
      state.flow.atlasDraws = state.flow.atlasDraws ?? { 0: 0, 1: 0 }
      state.flow.atlasDraws[player] = (state.flow.atlasDraws[player] ?? 0) + 1
    }
    // per-turn draw tracking + draw triggers (skip during setup)
    if (state.turn > 0) {
      state.flow = state.flow ?? {}
      state.flow.drawsThisTurn = state.flow.drawsThisTurn ?? { 0: 0, 1: 0 }
      state.flow.drawsThisTurn[player] = (state.flow.drawsThisTurn[player] ?? 0) + 1
      emitEvent(state, 'onCardDrawn' as any, player, deck)
    }
  }
  pushLog(state, player, `${p.name} draws ${n > 1 ? n + ' cards' : 'a card'} from their ${deck}.`)
}

/** "Draw a card" (as opposed to "draw a spell"): the drawing player chooses, for EACH card,
 *  whether to take the top spell (spellbook) or the top site (atlas) — exactly like the
 *  start-of-turn draw. Magician/Pathfinder-style avatars are never offered an atlas draw and
 *  just draw spells (noAtlasDrawChoice). Multiple cards are drawn one choice at a time so a
 *  player can, e.g., take one spell and one site. Use this — not drawCards(...,'spellbook') —
 *  wherever a card says "draw a card"/"draw N cards". */
export function askDrawCard(state: GameState, player: PlayerId, n = 1): void {
  if (n <= 0 || (state.phase as string) === 'over') return
  // No atlas choice possible (Magician/Pathfinder): draw all n as spells, no prompt.
  if (noAtlasDrawChoice(state, player)) {
    drawCards(state, player, 'spellbook', n)
    return
  }
  pushPrompt(state, {
    player,
    kind: 'drawDeck',
    title: n > 1 ? `Draw from your spellbook or your atlas? (${n} left)` : 'Draw from your spellbook or your atlas?',
    data: { options: ['spellbook', 'atlas'] },
    cont: 'core:drawCard',
    ctx: { player, remaining: n },
  })
}

registerCont('core:drawCard', (state, ctx: { player: PlayerId; remaining: number }, choice) => {
  drawCards(state, ctx.player, choice === 'atlas' ? 'atlas' : 'spellbook')
  const rem = (ctx.remaining ?? 1) - 1
  if (rem > 0) askDrawCard(state, ctx.player, rem) // chain the next card's choice
})

/** central tap helper so "whenever a unit taps" triggers fire (False Idol) */
export function tapUnit(state: GameState, unit: UnitState): void {
  if (unit.tapped) return
  unit.tapped = true
  emitEvent(state, 'onUnitTapped' as any, unit)
}

export function toCemetery(state: GameState, cardId: string): void {
  const card = state.cards[cardId]
  if (!card) return
  if (card.isToken) return // tokens cease to exist outside the realm
  // Kor Crematory: with (F)(F)(F)(F), cards headed for a cemetery are banished instead
  for (const site of Object.values(state.sites)) {
    if (site.name !== 'Kor Crematory' || site.isRubble || site.controller === null || siteSilenced(state, site)) continue
    // (F)(F)(F)(F) is a true-affinity gate (counts the Crematory's own Fire plus Elementalist/Cores/blooms), not just printed Fire on sites.
    if (affinity(state, site.controller).fire >= 4) {
      state.players[card.owner].banished.push(cardId)
      pushLog(state, null, `${card.name} is consumed by the Kor Crematory's flames.`)
      return
    }
  }
  // Mismanaged Mortuary: while an ODD number of them stand, the dead file
  // into the wrong drawer (the physical zone stays the owner's — this array
  // shuffle emulates the access swap)
  const morgues = ((state.flow?.mortuaries ?? []) as string[]).filter((id) => state.sites[id])
  if (morgues.length % 2 === 1) {
    state.players[opponent(card.owner)].cemetery.push(cardId)
    return
  }
  state.players[card.owner].cemetery.push(cardId)
}

/** Return a card from a cemetery to a DECK. It ALWAYS goes to the bottom of its OWNER's deck (atlas
 *  for a Site, spellbook otherwise) — never the deck of whoever's cemetery happened to hold it. A
 *  card can never be shuffled into the opponent's deck (rulebook). Mismanaged Mortuary & other
 *  cemetery swaps are irrelevant here: they only reroute cards ENTERING a cemetery, not ones leaving
 *  it for a deck. The caller removes the card from the cemetery first; returns the owner so the
 *  caller can shuffle that owner's decks if the effect calls for it. */
export function returnToDeck(state: GameState, cardId: string): PlayerId {
  const card = state.cards[cardId]
  const owner = card.owner
  const deck = getCard(card.name).type === 'Site' ? 'atlas' : 'spellbook'
  state.players[owner][deck].push(cardId)
  return owner
}

// ---- ward granting ----

/** The single arbiter for granting Ward to a UNIT. Enforces the two rulebook
 *  clauses that scattered `.ward = true` writes kept violating:
 *   · "Evil minions can't be warded" (Demon/Undead/Monster) — an Evil AVATAR is
 *     NOT a minion (Mephistopheles keeps Demon after replacing the avatar,
 *     faq 1953) and CAN be warded, so the refusal is gated on !isAvatar.
 *   · "A unit can't have multiple Wards" — no stacking; a second attempt is a
 *     no-op (returns false, no log — the ward it already has is the one ward).
 *  Returns true iff this call actually placed a new ward. Sites have no Evil
 *  clause, so site wards stay direct writes (see script comments). */
export function wardUnit(state: GameState, unit: UnitState): boolean {
  if (!unit.isAvatar && isEvilUnit(state, unit)) {
    pushLog(state, unit.controller, `${unit.name} is Evil — it cannot be warded.`)
    return false
  }
  if (unit.ward) return false // single-Ward clause: no stacking
  unit.ward = true
  return true
}

// ---- damage & death ----

/** returns true if a ward absorbed the event */
/** codex: a Ward breaks instead when its bearer would be damaged or destroyed
 *  (any source), or targeted by an OPPONENT's spell or special ability */
export function checkWard(
  state: GameState,
  target: { ward?: boolean },
  sourcePlayer: PlayerId | undefined,
  targetController: PlayerId | null,
  kind: 'damage' | 'destroy' | 'target' = 'damage',
): boolean {
  if (!target.ward || targetController === null) return false
  if (kind === 'target' && (sourcePlayer === undefined || sourcePlayer === targetController)) return false
  target.ward = false
  return true
}

// ---- Damage PREVENTION phase (rulebook: after all modification) --------------------------------
// Each prevention SOURCE lowers/negates the current amount and may consume itself (a broken ward, a
// spent Barricade). apply() mutates state and returns the new amount; `done` = a full stop (ward).
// `cardName` is the image shown in the "choose prevention order" prompt; `label` disclaims WHICH
// effect it is, so ONE card that grants several (a warded Tufted Turtles = Ward + shell) reads as two
// clearly-captioned entries. `kind` gates the prompt (all-Ward / all-same-effect sets skip it).
type Preventer = {
  kind: 'reduce' | 'wall' | 'prevent' | 'ward'
  cardName: string
  label: string
  owner: PlayerId
  apply: (n: number) => { amount: number; done?: boolean }
}

/** who "owns" a damage-affecting entity: a unit's controller, or a carried/conjured artifact's. */
function entityOwner(state: GameState, id: string): PlayerId | null {
  const u = state.units[id]
  if (u) return u.controller
  const a = state.artifacts[id]
  if (a) return a.carriedBy ? (state.units[a.carriedBy]?.controller ?? null) : a.conjuredBy
  return null
}

/** ALL prevention sources against `unit` for this hit, tagged by their owning player. Order within a
 *  player is the deterministic default (reductions → Shield Wall → prevention effects → Ward). */
function collectPreventers(
  state: GameState, unit: UnitState, sourcePlayer: PlayerId, source: DamageSource, n: number,
): Preventer[] {
  const list: Preventer[] = []
  // 1) static reductions "takes less damage" (Shield Maidens, Shellycoat, Ironclad, Excalibur).
  // damageReduction is a PURE read (returns how much less THIS hit is), so evaluate it now and only
  // list a real reducer: this drops no-op sources from the order prompt — e.g. an Imposter whose worn
  // mask has no reduction (its hook forwards the mask's and returns 0), or an Ironclad that only
  // shields ITSELF when some OTHER unit is the victim.
  for (const o of Object.values(state.units)) {
    if (o.silenced || isDisabled(state, o)) continue // a disabled reducer has no abilities to lend
    const red = getScript(o.name)?.damageReduction
    if (!red) continue
    const r = red(state, o, unit)
    if (r > 0) list.push({ kind: 'reduce', cardName: o.name, label: 'reduces damage', owner: o.controller, apply: (n) => ({ amount: n - r }) })
  }
  // 2) Shield Wall — each nearby ally shaves 1 (owned by the unit's controller)
  if (!unit.isAvatar && (state.flow?.shieldWall ?? []).some((w: any) => w.player === unit.controller)) {
    const buddies = Object.values(state.units).filter(
      (u) => u.id !== unit.id && u.controller === unit.controller &&
        nearbySquaresW(state, unit.x, unit.y).some((s) => s.x === u.x && s.y === u.y),
    ).length
    if (buddies > 0) list.push({ kind: 'wall', cardName: 'Shield Wall', label: 'Shield Wall', owner: unit.controller, apply: (n) => ({ amount: n - buddies }) })
  }
  // 3) prevention-tagged damageModifiers (Makeshift Barricade, Goswhit, elemental immunities, Tufted…)
  const addMod = (name: string, id: string, owner: PlayerId | null) => {
    if (owner === null) return
    // Pure immunities (damagePreviewPure): DRY-RUN the modifier to check it would actually reduce THIS
    // hit — an immunity vs the wrong element/subtype, or on a unit it doesn't cover, returns the amount
    // unchanged, so it's a no-op and shouldn't clutter the order prompt. Safe only because the flagged
    // modifiers have no side effects; unflagged (Makeshift/Goswhit/…) are never dry-run.
    if (n > 0 && getScript(name)?.damagePreviewPure) {
      const preview = getScript(name)!.damageModifier!(state, id, unit, n, source)
      if ((typeof preview === 'number' ? preview : preview.amount) >= n) return // no reduction → skip
    }
    list.push({ kind: 'prevent', cardName: name, label: 'prevents damage', owner, apply: (n) => {
      const res = getScript(name)!.damageModifier!(state, id, unit, n, source)
      return { amount: typeof res === 'number' ? res : res.amount }
    } })
  }
  for (const o of Object.values(state.units)) {
    if (o.silenced || isDisabled(state, o)) continue // a disabled/silenced preventer (Tufted Turtles) can't shell up
    const sc = getScript(o.name)
    if (sc?.damageModifier && sc.damagePreventer) addMod(o.name, o.id, o.controller)
  }
  for (const a of Object.values(state.artifacts)) {
    const sc = getScript(a.name)
    if (sc?.damageModifier && sc.damagePreventer) addMod(a.name, a.id, entityOwner(state, a.id))
  }
  // 4) Ward — a full negation that breaks once (owned by the unit's controller). Its card image is
  // the WARDED unit itself, captioned "Ward" so a warded card with its own prevention reads as two.
  // Ward is an ABILITY, so a silenced/disabled unit's ward doesn't function — even if checkStateBased
  // hasn't stripped the mark yet. But a unit PARTAKING IN A BATTLE is NOT disabled (the Basilisk's gaze
  // doesn't bite a fighter), so its ward works normally: it absorbs an otherwise-unprevented blow and
  // breaks, as usual. isDisabled already exempts battle/acting/entering units. (Avatars: never disabled.)
  if (unit.ward && !unit.silenced && !isDisabled(state, unit)) {
    list.push({ kind: 'ward', cardName: unit.name, label: 'Ward', owner: unit.controller, apply: (n) => {
      if (state.flow?.wardAbsorbed?.includes(unit.id)) return { amount: 0, done: true }
      if (checkWard(state, unit, sourcePlayer, unit.controller)) {
        pushLog(state, sourcePlayer, `${unit.name}'s ward breaks.`)
        if (state.flow?.wardAbsorbed) state.flow.wardAbsorbed.push(unit.id)
        return { amount: 0, done: true }
      }
      return { amount: n } // ward didn't apply here (e.g. Evil-minion exclusion) — no-op
    } })
  }
  // Prevention only ever protects its OWNER's own units (Makeshift shelters allies, Goswhit its bearer,
  // immunities the unit itself, Ward the warded unit) — a preventer owned by the enemy can never apply
  // to THIS victim, so drop it. (Otherwise a defender's counterstrike would pop a pointless "order your
  // prevention" prompt for the attacker's Barricade/Helmet, which do nothing to the enemy struck.)
  return list.filter((p) => p.owner === unit.controller)
}

/** True if this player's prevention set warrants an ordering prompt: ≥2 sources whose order is
 *  OBSERVABLE — NOT all Wards, and NOT all the same card+effect (two identical Barricades / Wards are
 *  interchangeable: the first zeroes the damage and the rest are skipped, so asking is pointless). */
function preventNeedsPrompt(sources: Preventer[]): boolean {
  if (sources.length < 2) return false
  if (sources.every((s) => s.kind === 'ward')) return false
  // pure static reductions ('reduce', e.g. Shield Maidens + Ironclad) and Shield Wall are commutative
  // and non-consuming — their order is never observable (n − a − b is the same either way), so they
  // must NOT pop an ordering prompt. Only order-observable CONSUMABLES (Makeshift Barricade & other
  // prevention effects, Ward — each spends/breaks once) warrant asking. Keeping reductions out of the
  // prompt also lets an area burst resolve a reduced hit synchronously, so batched deaths stay deferred
  // (an ordering prompt would pause the hit and recompute reductions AFTER the burst's deaths settled).
  const observable = sources.filter((s) => s.kind === 'prevent' || s.kind === 'ward')
  return new Set(observable.map((s) => `${s.cardName}:${s.kind}`)).size >= 2
}

/** normalize an ordering answer (an array of indices) into a full permutation of 0..n-1. */
function normalizeOrder(choice: unknown, n: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  if (Array.isArray(choice)) for (const v of choice) { const i = Number(v); if (Number.isInteger(i) && i >= 0 && i < n && !seen.has(i)) { seen.add(i); out.push(i) } }
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(i)
  return out
}

/** apply a player's prevention sources in a given index order, stopping the instant damage hits 0 (so
 *  an unspent consumable is left untouched). Returns the residual, or `done` on a full stop (Ward). */
function applyPreventionOrder(sources: Preventer[], order: number[], n: number): { amount: number; done: boolean } {
  for (const i of order) {
    if (n <= 0) break
    const s = sources[i]
    if (!s) continue
    const r = s.apply(n)
    if (r.done) return { amount: 0, done: true }
    n = r.amount
  }
  return { amount: n, done: false }
}

type PreventOutcome = { paused: true } | { done: true } | { amount: number }

/** Drive the prevention phase: the ACTIVE player resolves its sources, then the non-active player.
 *  When a player has ≥2 order-observable sources it is asked to CHOOSE THE ORDER (an `orderCards`
 *  prompt — same UI as ordering end-of-turn triggers — each entry the source's card + an effect
 *  caption, so a warded Tufted Turtles reads as two clearly-labelled entries), then resolves in that
 *  order stopping at 0. Returns `{paused}` when a prompt was pushed (the `damage:prevOrder` cont
 *  finishes the hit). See [[damage-modify-prevent-pipeline]]. */
function drivePrevention(
  state: GameState, unit: UnitState, n: number, sourcePlayer: PlayerId, source: DamageSource,
  opts: { lethal?: boolean; batch?: boolean; noRedirect?: boolean } | undefined,
  queue: PlayerId[],
): PreventOutcome {
  // a ward that already absorbed this simultaneous pass prevents every later blow too (serializable
  // flow.wardAbsorbed carries it across a paused hit's prompt).
  if (state.flow?.wardAbsorbed?.includes(unit.id)) return { done: true }
  while (queue.length) {
    if (n <= 0) break
    const player = queue[0]
    const mine = collectPreventers(state, unit, sourcePlayer, source, n).filter((s) => s.owner === player)
    if (mine.length === 0) { queue = queue.slice(1); continue }
    if (!preventNeedsPrompt(mine)) {
      const r = applyPreventionOrder(mine, mine.map((_, i) => i), n)
      if (r.done) return { done: true }
      n = r.amount
      queue = queue.slice(1)
      continue
    }
    // ≥2 order-observable → let this player choose the order (same prompt as end-of-turn triggers)
    pushPrompt(state, {
      player,
      kind: 'orderCards',
      title: `Choose your damage prevention order — ${unit.name} would take ${n}`,
      data: { cards: mine.map((s) => s.cardName), labels: mine.map((s) => s.label), place: 'resolve' },
      cont: 'damage:prevOrder',
      ctx: { unitId: unit.id, n, sourcePlayer, source, opts, queue },
    })
    return { paused: true }
  }
  return { amount: n }
}

registerCont('damage:prevOrder', (state, ctx: any, choice) => {
  const unit = state.units[ctx.unitId]
  if (!unit) return
  const player = ctx.queue[0] as PlayerId
  const mine = collectPreventers(state, unit, ctx.sourcePlayer, ctx.source, ctx.n as number).filter((s) => s.owner === player)
  const r = applyPreventionOrder(mine, normalizeOrder(choice, mine.length), ctx.n as number)
  if (r.done) return // fully prevented — the hit ends here
  const res = drivePrevention(state, unit, r.amount, ctx.sourcePlayer, ctx.source, ctx.opts, (ctx.queue as PlayerId[]).slice(1))
  if ('paused' in res) return
  if ('done' in res) return
  if (res.amount <= 0) return
  applyResolvedDamage(state, unit, res.amount, ctx.sourcePlayer, ctx.source, ctx.opts)
})

// ---- damage events (simultaneous-damage scope) ----
// A single card effect (a spell's onCast, an activated/triggered ability, a Genesis) is ONE damage
// event: all the damage it deals is simultaneous, so state-based DEATH is resolved only ONCE, after
// the whole effect finishes — never between two of its hits. This is why a reducer caught in its own
// blast (Shield Maidens hit by the same explosion that hits the avatar it shields) still shields for
// that blast: no unit is removed from the board until every hit's reduction/prevention has resolved.
// The engine opens this scope around each effect boundary (castSpell/ability/genesis); while it is
// open dealDamageToUnit defers death exactly like a batched combat strike. Depth-counted so nested
// effects (an ability that casts a spell) collapse to a single settle at the outermost close.
export function beginDamageEvent(state: GameState): void {
  state.flow = state.flow ?? {}
  state.flow.damageEventDepth = (state.flow.damageEventDepth ?? 0) + 1
}
export function endDamageEvent(state: GameState): void {
  if (!state.flow) return
  const depth = (state.flow.damageEventDepth ?? 0) - 1
  state.flow.damageEventDepth = depth > 0 ? depth : undefined
  if (depth <= 0) checkStateBased(state) // the event is over → settle every deferred death at once
}
/** Run `fn` as one simultaneous damage event (see beginDamageEvent). Deaths settle once, at the end. */
export function runDamageEvent<T>(state: GameState, fn: () => T): T {
  beginDamageEvent(state)
  try { return fn() } finally { endDamageEvent(state) }
}
/** True while a damage event is open — dealDamageToUnit then defers death to the event's close. */
export function inDamageEvent(state: GameState): boolean {
  return (state.flow?.damageEventDepth ?? 0) > 0
}

export function dealDamageToUnit(
  state: GameState,
  unit: UnitState,
  n: number,
  sourcePlayer: PlayerId,
  opts?: { lethal?: boolean; source?: DamageSource; batch?: boolean; noRedirect?: boolean },
): void {
  const source: DamageSource = opts?.source ?? { player: sourcePlayer, kind: 'effect' }
  // Royal Bodyguard: a nearby guard MAY take damage aimed at an Avatar / royalty instead — offered as a
  // yes/no prompt at the very moment of damage (works even for simultaneous combat damage). The cont
  // re-deals to the chosen target with `noRedirect`, so it can't loop. Scan only for a royal victim.
  if (n > 0 && !opts?.noRedirect && (unit.isAvatar || /\b(King|Queen|Prince|Princess)\b/.test(unit.name))) {
    const guard = Object.values(state.units).find((g) => !g.silenced && !isDisabled(state, g) && getScript(g.name)?.guardsRoyalty?.(state, g, unit))
    if (guard) {
      pushPrompt(state, {
        player: guard.controller,
        kind: 'yesNo',
        title: `Royal Bodyguard: take the ${n} damage aimed at ${unit.name} instead?`,
        data: {},
        cont: 'guard:redirect',
        ctx: { guardId: guard.id, victimId: unit.id, n, sourcePlayer, source, batch: !!opts?.batch, lethal: !!opts?.lethal },
      })
      return
    }
  }
  // A 0-power strike still "strikes" (events fire), and damage modifiers may boost it (Panpipes of
  // Pnom). So for strike sources we allow n=0 through to the modifier layer; the post-modifier
  // guard at line ~748 will return if n is still ≤0 after modifiers. All other sources (effects,
  // magic, abilities) with n≤0 are no-ops and exit immediately.
  if (n <= 0 && source.kind !== 'strike') return
  // `lastHitBy` is a single global slot kept for legacy readers (Grim Reaper, onDeathsDoor).
  if (n > 0 && source.attackerId) {
    state.flow = state.flow ?? {}
    state.flow.lastHitBy = { unitId: unit.id, attackerId: source.attackerId }
  }
  // KILL CREDIT, magic-protection, and Enduring Faith only apply when there is actual damage.
  // A 0-power strike (n=0) is allowed through to the modifier layer but skips these sections.
  if (n > 0) {
    // KILL CREDIT (priority 1): record every UNIT that damages this victim this turn — strikes AND
    // ability/effect damage (Vile Imp Genesis), but NOT magic (a spell credits its caster at prio 2).
    // A LIST, so two defenders can share the kill. Resolved into credit + the "dies" log in killUnit.
    {
      const damagerId = source.attackerId ?? source.sourceUnitId
      const dmgr = damagerId ? state.units[damagerId] : undefined
      if (dmgr && source.kind !== 'magic') {
        state.flow = state.flow ?? {}
        state.flow.damageCredit = state.flow.damageCredit ?? {}
        const list = (state.flow.damageCredit[unit.id] = state.flow.damageCredit[unit.id] ?? [])
        // `struck` here means "the damage source's OWN path already fired this unit's onKill/everKilled":
        // true for a combat STRIKE (runFightPass) and a PROJECTILE hit (resolveProjectileHit), both of
        // which fire onKill at their own site (and must, to cover a killer that died simultaneously —
        // killUnit skips dead killers). So killUnit must NOT re-fire onKill for these via onKillHere, or
        // it double-triggers (Stygian Archers' "summon a Skeleton on kill" fired TWICE on a ranged kill).
        // Ability/effect/Magic damage does NOT fire its own onKill → stays false → killUnit fires it.
        const struck = source.kind === 'strike' || source.kind === 'projectile'
        const existing = list.find((d: { id: string }) => d.id === damagerId)
        // SNAPSHOT the killer's position/controller now — so a killer that DIES in the same trade
        // (Redbreast Robin taking the Albatross's retaliation) still curses its allies at killUnit.
        if (existing) existing.struck = existing.struck || struck
        else list.push({ id: damagerId!, name: dmgr.name, x: dmgr.x, y: dmgr.y, controller: dmgr.controller, struck })
      }
    }
    // magic-protection (Failed Mutation, Amulet of Niniane, Arcade of Bones)
    if (source.kind === 'magic' && isMagicProtected(state, unit)) {
      pushLog(state, sourcePlayer, `${unit.name} is untouched by magic.`)
      return
    }
    // Enduring Faith: the warded champion takes damage for nearby allies instead
    for (const e of (state.flow?.enduringFaith ?? []) as { unitId: string; player: PlayerId; turn: number }[]) {
      const champ = state.units[e.unitId]
      if (!champ || champ.id === unit.id || unit.isAvatar) continue
      if (champ.controller !== unit.controller) continue
      const near = nearbySquaresW(state, champ.x, champ.y).some((s) => s.x === unit.x && s.y === unit.y)
      if (near) {
        pushLog(state, unit.controller, `${champ.name} takes the blow meant for ${unit.name}.`)
        dealDamageToUnit(state, champ, n, sourcePlayer, opts)
        return
      }
    }
  }
  // ============ MODIFICATION PHASE (rulebook: increases / multipliers / caps / replacements) ============
  // A 0-power strike still reaches here so a booster/replacement may act; other 0 sources returned above.
  // Increases first (Panpipes of Pnom "increased to 2"), then the modify layer ordered add → mul → cap →
  // lethal (each kind commutative — modification is additive, no player choice). PREVENTION comes AFTER.
  for (const other of Object.values(state.units)) {
    if (other.silenced) continue
    const boost = getScript(other.name)?.damageBoost
    if (boost) n = boost(state, other.id, unit, n, source)
  }
  for (const art of Object.values(state.artifacts)) {
    const boost = artScript(state, art)?.damageBoost // silenced artifact boosts nothing
    if (boost) n = boost(state, art.id, unit, n, source)
  }
  let forceLethal = false
  {
    const KIND = { add: 0, mul: 1, cap: 2, lethal: 3 } as const
    const mods: { name: string; id: string; k: keyof typeof KIND }[] = []
    for (const o of Object.values(state.units)) {
      if (o.silenced) continue
      const sc = getScript(o.name)
      if (sc?.damageModifier && !sc.damagePreventer) mods.push({ name: o.name, id: o.id, k: sc.damageModifierKind ?? 'add' })
    }
    for (const a of Object.values(state.artifacts)) {
      const sc = getScript(a.name)
      if (sc?.damageModifier && !sc.damagePreventer) mods.push({ name: a.name, id: a.id, k: sc.damageModifierKind ?? 'add' })
    }
    mods.sort((x, y) => KIND[x.k] - KIND[y.k])
    let stop = false // a redirect / replacement that fully prevents the original (Bruin, Sir Gawain, Goat)
    for (const m of mods) {
      if (stop) break
      const res = getScript(m.name)!.damageModifier!(state, m.id, unit, n, source)
      if (typeof res === 'number') n = res
      else { n = res.amount; if (res.lethal) forceLethal = true; if (res.prevented) stop = true }
    }
  }
  if (forceLethal) opts = opts ? { ...opts, lethal: true } : { lethal: true }
  if (n <= 0) return // fully modified away, a redirect handled the new target, or a 0-strike stayed 0
  // ============ PREVENTION PHASE (rulebook: reductions / immunities / Ward — AFTER all modification) ============
  // The active player resolves its prevention sources (its chosen order), then the non-active player; the
  // moment damage reaches 0 the rest are left untouched (two Makeshift Barricades → only one breaks).
  {
    const pv = drivePrevention(state, unit, n, sourcePlayer, source, opts, [state.activePlayer, opponent(state.activePlayer)])
    if ('paused' in pv) return // an ordering prompt is pending; the damage:prevPick cont finishes the hit
    if ('done' in pv) return
    n = pv.amount
    if (n <= 0) return
  }
  applyResolvedDamage(state, unit, n, sourcePlayer, source, opts)
}

/** Apply the FINAL (post-modification, post-prevention) damage `n` to the target: spell-reveal glow,
 *  avatar life-loss / death's-door / Koschei / Altar save, Free City bleed, Stitched Abomination part
 *  allocation, sleeper wake, minion accumulation + onSelfDamaged, lethal kill. Extracted so the
 *  prevention-ordering prompt's continuation (Phase 4) can finish a paused hit. */
function applyResolvedDamage(
  state: GameState, unit: UnitState, n: number, sourcePlayer: PlayerId,
  source: DamageSource, opts?: { lethal?: boolean; batch?: boolean; noRedirect?: boolean },
): void {
  // spell-cast reveal: a MAGIC that damages a unit glows that unit's site red — even when the
  // spell picks no explicit target (Rain of Arrows hits every surface minion). Gated on the
  // magic source kind so combat / ability / effect damage never leaks into the reveal.
  if (source.kind === 'magic') recordAffectedSites(state, [{ x: unit.x, y: unit.y }])
  if (unit.isAvatar) {
    if (unit.deathsDoor) {
      if (unit.doorTurn === state.turn) {
        pushLog(state, sourcePlayer, `${unit.name} is immune to damage this turn.`)
        return
      }
      // Koschei's Egg: the avatar's soul is elsewhere — death blows can't land
      if (state.flow?.koschei?.player === unit.controller) {
        pushLog(state, sourcePlayer, `${unit.name}'s soul is hidden in Koschei's Egg — the blow means nothing.`)
        return
      }
      // Altar of Malachai: the controller may sacrifice a minion atop the Altar
      // instead of dying. Opens a prompt (the game-end is deferred until answered);
      // returning true means the death blow is on hold pending that choice.
      if (offerAvatarDeathSave(state, unit, sourcePlayer)) return
      finalizeAvatarDeath(state, unit.id, sourcePlayer)
      return
    }
    if (state.flow?.lifeLost) state.flow.lifeLost[unit.controller] = (state.flow.lifeLost[unit.controller] ?? 0) + n
    unit.life = Math.max(0, (unit.life ?? 0) - n)
    pushLog(state, sourcePlayer, `${unit.name} takes ${n} damage (life ${unit.life}).`)
    if (unit.life === 0) {
      unit.deathsDoor = true
      unit.doorTurn = state.turn
      pushLog(state, null, `${unit.name} is at death's door!`)
      emitEvent(state, 'onDeathsDoor', unit)
    }
    // ANY damage to an avatar fires its own "when I take damage" hook. Avatars return
    // early here (never reaching the non-avatar onSelfDamaged path below), so the
    // Imposter's mask only ever cracked on combat — now it breaks on ANY damage (Heat Ray,
    // Redbreast Robin, any spell/ability/strike), per the card.
    const avScript = getScript(unit.name)
    if (avScript?.onSelfDamaged && !unit.silenced) avScript.onSelfDamaged(makeCtx(state, unit.id, unit.controller, []), n)
    emitEvent(state, 'onLifeLost', unit.controller, n, source)
    return
  }
  // the Free City fights as a unit but bleeds as a site: strikes against it
  // cost its controller life, and it never dies of damage (FAQ)
  if (getScript(unit.name)?.damageBecomesLifeLoss) {
    pushLog(state, sourcePlayer, `${unit.name} is struck for ${n}.`)
    loseLife(state, unit.controller, n, false)
    emitEvent(state, 'onLifeLost', unit.controller, n, source ?? { player: sourcePlayer, kind: 'effect' })
    return
  }
  // Stitched Abomination: damage lands on a chosen part, not the whole
  if (getScript(unit.name)?.takesDamageInParts && !unit.silenced) {
    const parts = (state.flow?.abomParts?.[unit.id] ?? []) as { name: string; damage: number }[]
    const alive = parts.filter((p) => p.damage < Math.max(1, getCard(p.name).defence ?? getCard(p.name).attack ?? 1))
    // lethal (or outright kill) destroys every part at once — no allocation
    if (alive.length > 0 && opts?.lethal) {
      for (const p2 of alive) p2.damage = 999
      pushLog(state, sourcePlayer, `${unit.name} comes apart at the seams.`)
      killUnit(state, unit.id)
      return
    }
    if (alive.length > 0) {
      pushPrompt(state, {
        player: sourcePlayer,
        kind: 'chooseOption',
        title: `${unit.name} takes ${n} — which part is struck?`,
        data: { options: alive.map((p) => p.name) },
        cont: 'abom:part',
        ctx: { unitId: unit.id, n, sourcePlayer, lethal: !!opts?.lethal },
      })
      return
    }
  }
  // sleepers wake when hurt (Sleep, Slumbering Giantess, Dream-Quest)
  if (unit.counters?.asleep) {
    delete unit.counters.asleep
    unit.disabled = undefined
    pushLog(state, null, `${unit.name} jolts awake!`)
  }
  unit.damage += n
  pushLog(state, sourcePlayer, `${unit.name} takes ${n} damage.`)
  emitEvent(state, 'onUnitDamaged', { ...unit }, n, source)
  // "whenever this takes damage" triggers (Flagellant...)
  const script = getScript(unit.name)
  if (script?.onSelfDamaged && !unit.silenced) {
    script.onSelfDamaged(makeCtx(state, unit.id, unit.controller, []), n)
  }
  if (opts?.lethal && n > 0) {
    // lethal immunity (Sir Priamus shields nearby allies)
    const shielded = Object.values(state.units).some((o) => {
      if (o.silenced || o.controller !== unit.controller) return false
      const f = getScript(o.name)?.protectsAlliesFromLethal
      return !!f && f(state, o.id, unit)
    })
    if (!shielded) {
      killUnit(state, unit.id)
      return
    }
    pushLog(state, unit.controller, `${unit.name} shrugs off the killing venom.`)
  }
  // In a batched exchange (simultaneous combat strikes) the caller resolves deaths ONCE
  // after every blow lands, so no striker is removed mid-exchange — otherwise a unit that
  // trades a fatal blow would vanish before the enemy's simultaneous strike consults it
  // (e.g. Sirian Templar's "no damage from Undead" couldn't see the Undead that just died).
  // The same holds for a whole card effect: while a damage event is open (a spell / ability /
  // Genesis is mid-resolution) every hit it deals is simultaneous, so death is deferred to the
  // event's close — a reducer (Shield Maidens) killed by the same blast still shields the rest of it.
  if (!opts?.batch && !inDamageEvent(state)) checkStateBased(state)
}

// ---- avatar death blow: Altar-of-Malachai-style save ----

type DeathSaveOffer = { siteId: string; unitId: string; label: string }

/** End the game after a death blow (guarded so it only fires once). */
function finalizeAvatarDeath(state: GameState, avatarId: string, sourcePlayer: PlayerId): void {
  const avatar = state.units[avatarId]
  if ((state.phase as string) === 'over') {
    // A SECOND avatar death blow within the same resolution — a single simultaneous source (a
    // Craterize / explosion hitting both Avatars at death's door) just felled the player who was
    // declared the winner a moment ago. Both Avatars fell at once → the game is a DRAW (rulebook:
    // the win needs to vanquish ALL opposing Avatars, and here both conditions are met together).
    if (avatar && state.winner !== null && state.winner === avatar.controller) {
      state.winner = null
      state.draw = true
      pushLog(state, null, 'Both Avatars fall at once — the game is a draw!')
    }
    return
  }
  if (!avatar) return
  state.winner = opponent(avatar.controller)
  state.phase = 'over'
  pushLog(state, sourcePlayer, `Death blow! ${avatar.name} is defeated.`)
}

/** Collect every "sacrifice instead of dying" offer from sites the dying Avatar's
 *  controller owns (Altar of Malachai). If any exist, prompt the controller and
 *  return true (the death is deferred until they answer). */
function offerAvatarDeathSave(state: GameState, avatar: UnitState, sourcePlayer: PlayerId): boolean {
  const offers: DeathSaveOffer[] = []
  for (const site of Object.values(state.sites)) {
    if (site.isRubble || site.controller !== avatar.controller || siteSilenced(state, site)) continue
    const hook = getScript(site.name)?.avatarDeathSave
    if (!hook) continue
    for (const uid of hook(state, site.id, avatar)) {
      const u = state.units[uid]
      if (u) offers.push({ siteId: site.id, unitId: uid, label: `${u.name} ${squareLabel(u.x, u.y)}` })
    }
  }
  if (!offers.length) return false
  pushPrompt(state, {
    player: avatar.controller,
    kind: 'yesNo',
    title: 'Death blow! Sacrifice a minion on your Altar of Malachai to survive?',
    data: {},
    cont: 'avatar:deathSaveAsk',
    ctx: { avatarId: avatar.id, sourcePlayer, offers },
  })
  return true
}

/** Perform the sacrifice: spend the Altar, kill the chosen minion (a real death →
 *  Deathrites fire), and the Avatar lives on (still at death's door). */
function altarSacrifice(state: GameState, siteId: string, unitId: string, avatarId: string, sourcePlayer: PlayerId): void {
  const site = state.sites[siteId]
  const u = state.units[unitId]
  const avatar = state.units[avatarId]
  if (!site || !u || !avatar) return finalizeAvatarDeath(state, avatarId, sourcePlayer)
  ;(site as any).altarUsed = true
  pushLog(state, avatar.controller, `${u.name} is sacrificed on the ${site.name} — the death blow is averted!`)
  // a sacrifice is a forced self-kill that bypasses "can't be destroyed" (The Doom of Dilmun)
  const prevSac = state.flow?.sacrificing
  state.flow = state.flow ?? {}
  state.flow.sacrificing = u.id
  killUnit(state, u.id)
  state.flow.sacrificing = prevSac
  checkStateBased(state)
}

registerCont('avatar:deathSaveAsk', (state, ctx: { avatarId: string; sourcePlayer: PlayerId; offers: DeathSaveOffer[] }, choice) => {
  if (!choice) return finalizeAvatarDeath(state, ctx.avatarId, ctx.sourcePlayer)
  // re-validate: the minion may have moved off / the Altar may already be spent
  const valid = ctx.offers.filter(
    (o) => state.units[o.unitId] && state.sites[o.siteId] && !(state.sites[o.siteId] as any).altarUsed,
  )
  if (!valid.length) return finalizeAvatarDeath(state, ctx.avatarId, ctx.sourcePlayer)
  if (valid.length === 1) return altarSacrifice(state, valid[0].siteId, valid[0].unitId, ctx.avatarId, ctx.sourcePlayer)
  const avatar = state.units[ctx.avatarId]
  pushPrompt(state, {
    player: avatar?.controller ?? ctx.sourcePlayer,
    kind: 'chooseOption',
    title: 'Sacrifice which minion?',
    data: { options: valid.map((o, i) => `${i + 1}. ${o.label}`) },
    cont: 'avatar:deathSavePick',
    ctx: { avatarId: ctx.avatarId, sourcePlayer: ctx.sourcePlayer, offers: valid },
  })
})

registerCont('avatar:deathSavePick', (state, ctx: { avatarId: string; sourcePlayer: PlayerId; offers: DeathSaveOffer[] }, choice) => {
  const idx = ctx.offers.findIndex((o, i) => `${i + 1}. ${o.label}` === choice)
  const pick = idx >= 0 ? ctx.offers[idx] : undefined
  if (!pick || !state.units[pick.unitId]) return finalizeAvatarDeath(state, ctx.avatarId, ctx.sourcePlayer)
  altarSacrifice(state, pick.siteId, pick.unitId, ctx.avatarId, ctx.sourcePlayer)
})

// Mortal Soil: banish the chosen cemetery minion; the affected site's damage was
// already prevented by the deferral (return true from affectedSiteDamage).
registerCont('mortalSoil:banish', (state, ctx: { auraId: string; minionIds: string[] }, choice) => {
  const idxs = Array.isArray(choice) ? choice : []
  const i = typeof idxs[0] === 'number' ? idxs[0] : 0
  const aura = state.auras[ctx.auraId]
  if (!aura) return
  const id = ctx.minionIds[i] ?? ctx.minionIds[0]
  const p = state.players[aura.controller]
  const ci = id ? p.cemetery.indexOf(id) : -1
  if (ci >= 0) {
    p.cemetery.splice(ci, 1)
    p.banished.push(id)
    pushLog(state, aura.controller, `${state.cards[id].name} is fed to the Mortal Soil — the site is spared.`)
  }
})

export function dealDamage(state: GameState, target: TargetRef, n: number, sourcePlayer: PlayerId, source?: DamageSource): void {
  if ('unit' in target) {
    const unit = state.units[target.unit]
    if (unit) dealDamageToUnit(state, unit, n, sourcePlayer, source ? { source } : undefined)
  } else if ('site' in target) {
    const site = state.sites[target.site]
    if (!site) return
    if (checkWard(state, site, sourcePlayer, site.controller)) {
      pushLog(state, sourcePlayer, `${site.name}'s ward breaks.`)
      return
    }
    // prevention/modification layer (Mortal Soil)
    for (const r of Object.values(state.auras)) {
      const mod = getScript(r.name)?.siteDamageModifier
      if (mod) n = mod(state, r.id, site, n, source)
    }
    for (const a of Object.values(state.artifacts)) {
      const mod = artScript(state, a)?.siteDamageModifier // silenced artifact: no damage modifier
      if (mod) n = mod(state, a.id, site, n, source)
    }
    if (n <= 0) return
    // affected-site prevention that may PROMPT (Mortal Soil): fired only for sites the
    // aura affects. If it handles the damage (prevents now, or defers via a prompt),
    // stop here — the damage is not applied.
    for (const r of Object.values(state.auras)) {
      const prevent = getScript(r.name)?.affectedSiteDamage
      if (prevent && prevent(state, r.id, site, n, sourcePlayer, source)) return
    }
    // City of Souls: the enemy may redirect the site damage to any unit
    if (site.controller !== null && sourcePlayer !== site.controller && getScript(site.name)?.siteDamageRedirect) {
      pushPrompt(state, {
        player: sourcePlayer,
        kind: 'yesNo',
        title: `Redirect the ${n} damage from ${site.name} to a unit?`,
        data: {},
        cont: 'site:redirect',
        ctx: { siteId: site.id, n, sourcePlayer },
      })
      return
    }
    // damaging a site causes its controller to LOSE that much life (not damage)
    if (site.controller !== null) {
      loseLife(state, site.controller, n, false)
      emitEvent(state, 'onLifeLost', site.controller, n, source ?? { player: sourcePlayer, kind: 'effect' })
      pushLog(state, sourcePlayer, `${site.name} is struck for ${n}.`)
    }
    // "when this site is damaged" triggers (City of Glass, Wizard's Den)
    if (state.sites[site.id]) emitEvent(state, 'onSiteDamaged', site, n, sourcePlayer)
  }
}

/** a carried artifact that pins its bearer against all modification (Tabula Rasa) */
function carriedUnmodifiable(state: GameState, unit: UnitState): boolean {
  return unit.carrying.some((id) => {
    const art = state.artifacts[id]
    return !!art && !!getScript(art.name)?.bearerUnmodifiable
  })
}

export function loseLife(state: GameState, player: PlayerId, n: number, emit = true): void {
  if (n <= 0) return
  const avatar = avatarOf(state, player)
  if (emit) emitEvent(state, 'onLifeLost', player, n, null)
  if (avatar.deathsDoor) return // life loss cannot deliver a death blow
  if (state.flow?.lifeLost) state.flow.lifeLost[player] = (state.flow.lifeLost[player] ?? 0) + n
  avatar.life = Math.max(0, (avatar.life ?? 0) - n)
  pushLog(state, player, `${state.players[player].name} loses ${n} life (now ${avatar.life}).`)
  if (avatar.life === 0) {
    avatar.deathsDoor = true
    avatar.doorTurn = state.turn
    pushLog(state, null, `${avatar.name} is at death's door!`)
    // arriving at death's door fires the trigger whether the 0 came from damage OR life loss
    // (site attacks) — Mount Ussar Sanctuary's "flee here and gain Ward" was missing this.
    emitEvent(state, 'onDeathsDoor', avatar)
    // Friends until the end — Tawny dealt the blow that put the enemy Avatar at death's door
    const hitter = state.flow?.lastHitBy?.unitId === avatar.id ? state.units[state.flow.lastHitBy.attackerId] : null
    if (hitter?.name === 'Tawny' && hitter.controller !== player) awardAchievement(state, 'friends-until-end', hitter.controller)
  }
}

/** is this unit protected from being moved by enemy spells and abilities?
 *  (its own `immovable`, or a nearby Old Salt Anchorman ally) */
export function moveProtected(state: GameState, unit: UnitState): boolean {
  if (getScript(unit.name)?.immovable && !unit.silenced) return true
  for (const o of Object.values(state.units)) {
    if (o.silenced || o.controller !== unit.controller) continue
    const f = getScript(o.name)?.protectsAlliesFromMoves
    if (f && f(state, o.id, unit)) return true
  }
  return false
}

/** central submerge: honors submerge-protection (Driftwood Marrows) and drowns
 *  units that can't exist underwater. Returns true if the unit went under. */
export function trySubmerge(state: GameState, unit: UnitState): boolean {
  if (unit.isAvatar || unit.region === 'underwater') return false
  // An oversized unit is submerged only if its WHOLE footprint is water (rulebook: a
  // forced submerge of an oversized unit fails unless it occupies a single terrain).
  // It does NOT drown here — the effect simply fails to move a unit straddling land.
  if (occupiedSquares(unit).length > 1 && !footprintAllTerrain(state, unit, 'water')) {
    pushLog(state, unit.controller, `${unit.name} is too large to submerge across mixed terrain.`)
    return false
  }
  for (const o of Object.values(state.units)) {
    if (o.silenced || o.controller !== unit.controller) continue
    const f = getScript(o.name)?.protectsAlliesFromSubmerge
    if (f && f(state, o.id, unit)) {
      pushLog(state, unit.controller, `${unit.name} clings on — it can't be submerged.`)
      return false
    }
  }
  for (const artId of unit.carrying) {
    const art = state.artifacts[artId]
    if (art && artScript(state, art)?.protectsAlliesFromSubmerge) {
      pushLog(state, unit.controller, `${unit.name} clings on — it can't be submerged.`)
      return false
    }
  }
  unit.region = 'underwater'
  if (!canExistIn(state, unit, 'underwater', unit.x, unit.y)) {
    pushLog(state, null, `${unit.name} drowns!`)
    const snapshot = { ...unit }
    killUnit(state, unit.id)
    checkStateBased(state)
    emitEvent(state, 'onDrowned', snapshot)
  }
  return true
}

/** Strike each of `targetIds` with the striker SIMULTANEOUSLY (rulebook/FAQ: a "strike
 *  each enemy" effect deals all its strikes at once — Whirling Blades, Falling Star, …).
 *  So: fire each "when this strikes" hook, apply ALL the damage, THEN resolve deaths
 *  together, THEN each survived-struck / kill trigger. Never prompts, never picks an order.
 *  De-dupe the caller's list first if the same unit could appear twice (each is struck once). */
export function strikeAllSimultaneous(state: GameState, strikerId: string, targetIds: string[], controller: PlayerId): void {
  const striker = state.units[strikerId]
  if (!striker) return
  const targets = [...new Set(targetIds)].filter((id) => id !== strikerId && state.units[id]).map((id) => state.units[id]!)
  if (!targets.length) return
  const kw = effKeywords(state, striker)
  const power = effAttack(state, striker)
  const lethalVs = !striker.silenced ? getScript(striker.name)?.lethalVs : undefined
  const strikeHook = !striker.silenced ? getScript(striker.name)?.onStrike : undefined
  // 1. "whenever this strikes" fires for each target (a strike is an action, even at 0 power)
  for (const tu of targets) if (strikeHook && state.units[tu.id]) strikeHook(makeCtx(state, striker.id, controller, []), tu)
  // 2. apply ALL damage before any death resolves — the strikes are simultaneous
  const snaps = targets.map((t) => ({ ...t }))
  for (const tu of targets) {
    if (!state.units[tu.id]) continue
    if (tu.isAvatar) emitEvent(state, 'onAllyStrikesAvatar', striker, tu)
    if (power > 0) {
      dealDamageToUnit(state, tu, power, controller, {
        lethal: (kw.lethal || !!lethalVs?.(state, striker, tu)) && !tu.isAvatar,
        source: { player: controller, kind: 'strike', attackerId: striker.id, name: striker.name },
      })
    }
  }
  checkStateBased(state) // simultaneous deaths
  // 3. per target: "when struck" (survivors) or kill triggers (the fallen)
  for (const snap of snaps) {
    const survivor = state.units[snap.id]
    if (survivor) {
      const s = getScript(survivor.name)
      if (s?.onSelfStruck && !survivor.silenced) s.onSelfStruck(makeCtx(state, survivor.id, survivor.controller, []), striker)
    } else {
      if (state.units[strikerId]) striker.counters = { ...striker.counters, everKilled: 1 }
      const killHook = !striker.silenced ? getScript(striker.name)?.onKill : undefined
      if (killHook) killHook(makeCtx(state, striker.id, controller, []), snap as UnitState)
      emitEvent(state, 'onUnitKilled', snap, striker)
    }
  }
  checkStateBased(state)
}

/** healing multipliers stack per source, floored at each step: one River of
 *  Blood (×0.5) halves, two quarter, and a ×0 source shuts healing off entirely */
export function applyHealingModifier(state: GameState, n: number): number {
  const apply = (mult: number | undefined) => {
    if (mult !== undefined) n = Math.floor(n * mult)
  }
  for (const s of Object.values(state.sites)) {
    if (!s.isRubble && s.controller !== null && !siteSilenced(state, s)) apply(getScript(s.name)?.healingMultiplier)
  }
  for (const u of Object.values(state.units)) {
    if (!u.silenced) apply(getScript(u.name)?.healingMultiplier)
  }
  for (const a of Object.values(state.artifacts)) apply(artScript(state, a)?.healingMultiplier) // silenced → no heal mult
  for (const r of Object.values(state.auras)) apply(getScript(r.name)?.healingMultiplier)
  return n
}

/** Sphere of Animosity & kin: is the square (x,y) inside an aura that traps avatars? A trapped
 *  avatar "can't leave, heal, or be defended" — every one of those code paths funnels through this
 *  single check so no movement route (normal step, forced drag, teleport/blaze) can slip past it. */
export function avatarTrappedAt(state: GameState, x: number, y: number): boolean {
  for (const r of Object.values(state.auras)) {
    if (getScript(r.name)?.auraTrapsAvatars && r.squares.some((s) => s.x === x && s.y === y)) return true
  }
  return false
}

/** Would relocating `unit` to (toX,toY) break a Sphere-of-Animosity trap it currently sits in?
 *  FAQ: a trapped avatar "can't enter locations not occupied by the Sphere — [it] can't move to
 *  those locations, or be moved by force." So a step OR any forced move (pull/push/teleport/swap/
 *  drag) to a square OUTSIDE the trap is illegal, while moving to another trap-occupied square is
 *  fine. Non-avatars, and avatars not under a trap, are never blocked. */
export function avatarTrapBlocksMove(state: GameState, unit: UnitState, toX: number, toY: number): boolean {
  if (!unit.isAvatar) return false
  for (const r of Object.values(state.auras)) {
    if (!getScript(r.name)?.auraTrapsAvatars) continue
    if (!r.squares.some((s) => s.x === unit.x && s.y === unit.y)) continue // not under this trap
    if (!r.squares.some((s) => s.x === toX && s.y === toY)) return true // destination escapes it
  }
  return false
}

export function gainLife(state: GameState, player: PlayerId, n: number): void {
  const avatar = avatarOf(state, player)
  // Sphere of Animosity: trapped avatars can't heal
  if (avatarTrappedAt(state, avatar.x, avatar.y)) {
    pushLog(state, player, `${avatar.name} cannot heal inside the Sphere of Animosity.`)
    return
  }
  n = applyHealingModifier(state, n)
  if (avatar.deathsDoor || n <= 0) return
  // maximum life can be overridden by effects (e.g. Deathwish halves it)
  const max = avatar.counters?.maxLife ?? getCard(avatar.name).life ?? 20
  avatar.life = Math.min(max, (avatar.life ?? 0) + n)
  pushLog(state, player, `${state.players[player].name} gains ${n} life (now ${avatar.life}).`)
}

export function healUnit(state: GameState, unitId: string, n: number): void {
  const unit = state.units[unitId]
  if (!unit) return
  n = applyHealingModifier(state, n)
  unit.damage = Math.max(0, unit.damage - n)
}

// Units currently mid-death. A deathrite runs while its unit still sits in the
// realm with lethal damage (it isn't removed until the deathrite finishes), so a
// deathrite that calls checkStateBased — e.g. Accursed Albatross — would otherwise
// re-detect the same lethal unit and recurse forever, softlocking the game. This
// transient set (cleared as the synchronous kill unwinds) makes killUnit re-entrant
// for the SAME unit a no-op.
const dyingUnits = new Set<string>()
// re-entrancy depth for checkStateBased: kill-credit (flow.damageCredit) is scoped to the
// current damage EVENT, so we wipe it once a settle FULLY completes (survivors weren't killed by
// it). Only at the TOP level — a deathrite's nested settle mustn't clear a co-dying unit's credit.
let sbDepth = 0

export function killUnit(state: GameState, unitId: string): void {
  const unit = state.units[unitId]
  if (!unit || unit.isAvatar) return
  // Blaze of Glory: the champion doesn't die until its fights are done
  if (state.flow?.undying === unitId) return
  // its death is already resolving behind a prompt (an async deathrite still landing) — the unit lingers
  // in the realm until that finishes, so don't re-process it (completeDeferredDeaths will finalize it).
  if ((state.flow?.deathResolving ?? []).includes(unitId)) return
  // already being killed (a deathrite re-entered via checkStateBased) → don't recurse
  if (dyingUnits.has(unitId)) return
  // death-replacement effects (Gilded Aegis, Lady Iseult...) get first say
  for (const u of Object.values(state.units)) {
    if (u.silenced) continue
    const would = getScript(u.name)?.onWouldDie
    if (would && would(state, u.id, unit)) return
  }
  for (const a of Object.values(state.artifacts)) {
    const would = artScript(state, a)?.onWouldDie // silenced artifact can't replace a death
    if (would && would(state, a.id, unit)) return
  }
  dyingUnits.add(unitId)
  try {
    // ---- KILL CREDIT (rulebook priority 1 damage > 2 magic > 3 ability). Priority 1: the units
    // that damaged THIS victim in the fatal event (flow.damageCredit — strikes + ability damage,
    // scoped to the current event by checkStateBased). Else the ambient action-credit (a Magic the
    // caster just resolved = 2, or an activated/triggered ability = 3). Only units; may be several.
    type KillerSnap = { id: string; x: number; y: number; controller: PlayerId }
    const dmg = (state.flow?.damageCredit?.[unitId] ?? []) as { id: string; name: string; x: number; y: number; controller: PlayerId; struck: boolean }[]
    let creditSnaps: KillerSnap[] = [] // {id,x,y,controller} — position SNAPSHOT (killer may have died in a trade)
    let creditNames: string[] = []
    let onKillHere: string[] = [] // killers whose everKilled/onKill we fire HERE (the strike path already did its own)
    if (dmg.length) {
      creditSnaps = dmg.map((d) => ({ id: d.id, x: d.x, y: d.y, controller: d.controller }))
      creditNames = dmg.map((d) => d.name)
      onKillHere = dmg.filter((d) => !d.struck).map((d) => d.id) // strikes/projectiles already fired onKill at their own site
    } else if (state.flow?.actionCredit?.unitIds?.length) {
      for (const id of state.flow.actionCredit.unitIds as string[]) {
        const u = state.units[id]
        if (u) { creditSnaps.push({ id, x: u.x, y: u.y, controller: u.controller }); creditNames.push(u.name) }
      }
      onKillHere = state.flow.actionCredit.unitIds
    }
    const creditIds = creditSnaps.map((s) => s.id)
    state.flow = state.flow ?? {}
    state.flow.killerByVictim = state.flow.killerByVictim ?? {}
    if (creditSnaps.length) state.flow.killerByVictim[unitId] = creditSnaps // read by the deathrite below (Albatross)
    const promptsBefore = state.prompts.length // to detect an ASYNC deathrite/echo (one that raises a prompt)
    // deathrite fires before the unit leaves the realm — but a DISABLED minion "loses all
    // abilities" (rulebook glossary), so a disabled unit's Deathrite does NOT trigger.
    const script = getScript(unit.name)
    if (script?.deathrite && !unit.silenced && !isDisabled(state, unit)) {
      pushLog(state, unit.controller, `${unit.name}'s deathrite triggers.`)
      script.deathrite(makeCtx(state, unit.id, unit.controller, []))
      // the deathrite may have moved the unit out of the realm itself (e.g. a bounce)
      if (!state.units[unitId]) return
    }
    // The Geistwood: genesis abilities here are also deathrite abilities (a disabled unit
    // loses all abilities, so this death-echo doesn't fire for one either). A site's "here"
    // covers its subsurface too, so this fires for a minion dying burrowed/submerged at the site.
    if (script?.genesis && !unit.silenced && !isDisabled(state, unit)) {
      const haunted = Object.values(state.sites).some(
        (s) =>
          getScript(s.name)?.siteGenesisAlsoDeathrite &&
          !s.isRubble && s.controller !== null &&
          s.x === unit.x && s.y === unit.y && !siteSilenced(state, s),
      )
      if (haunted) {
        pushLog(state, unit.controller, `The Geistwood echoes ${unit.name}'s genesis as it dies.`)
        script.genesis(makeCtx(state, unit.id, unit.controller, []))
        if (!state.units[unitId]) return
      }
    }
    // Async deathrite/echo (it raised a prompt): the unit must stay in the realm until the rite fully
    // resolves — so its strike lands while the striker still exists (rulebook: a deathrite applies
    // BEFORE the unit leaves the realm). Defer the removal; the applyAction boundary finalizes the death
    // (completeDeferredDeaths) once the prompt chain — including the strike's own defend window — clears.
    const death: DeathRecord = { creditNames, creditIds, onKillHere }
    if (state.prompts.length > promptsBefore) {
      state.flow.deathResolving = [...(state.flow.deathResolving ?? []), unitId]
      state.flow.pendingDeaths = [...(state.flow.pendingDeaths ?? []), { unitId, death }]
      return
    }
    finalizeDeath(state, unitId, death)
  } finally {
    dyingUnits.delete(unitId)
  }
}

type DeathRecord = { creditNames: string[]; creditIds: string[]; onKillHere: string[] }

/** Remove a dead unit from the realm and run its post-death bookkeeping (cemetery, death tracking,
 *  killer onKill/everKilled, onAnyDeath). Split out of killUnit so it can run synchronously OR — when
 *  the deathrite raised a prompt — deferred until that prompt chain resolves. */
function finalizeDeath(state: GameState, unitId: string, death: DeathRecord): void {
  const unit = state.units[unitId]
  if (!unit) return
  removeUnitFromRealm(state, unitId)
  toCemetery(state, unit.cardId)
  delete state.units[unitId]
  pushLog(state, null, `${unit.name} dies.${death.creditNames.length ? ` (killed by ${joinNames(death.creditNames)})` : ''}`)
  // per-turn death tracking with killer attribution (Keening Banshee, Bitter Departed, Megalurker...)
  state.flow = state.flow ?? {}
  const hit = state.flow.lastHitBy?.unitId === unit.id ? state.flow.lastHitBy : null
  state.flow.diedThisTurn = [
    ...(state.flow.diedThisTurn ?? []),
    { name: unit.name, controller: unit.controller, x: unit.x, y: unit.y, killerId: death.creditIds[0] ?? hit?.attackerId ?? null },
  ]
  // credit the combat strike-path didn't (ability/magic kills): everKilled + the killer's onKill hook
  for (const kid of death.onKillHere) {
    const k = state.units[kid]
    if (!k) continue
    k.counters = { ...k.counters, everKilled: 1 }
    const hook = !k.silenced ? getScript(k.name)?.onKill : undefined
    if (hook) hook(makeCtx(state, k.id, k.controller, []), unit)
  }
  trackDeathAchievements(state, unit, death)
  emitEvent(state, 'onAnyDeath', { ...unit })
}

/** Achievements that key off a KILL and its cause — resolved here where the victim + killer credit
 *  are both known. `unit` is the just-removed victim (its snapshot is still valid). */
function trackDeathAchievements(state: GameState, unit: UnitState, death: DeathRecord): void {
  try {
    // I'm the real one — an Evil Twin kills the minion it copied, or that original kills the twin
    for (const pair of (state.flow?.evilTwins ?? []) as { twinId: string; originalId: string }[]) {
      const twinDied = unit.id === pair.twinId && death.creditIds.includes(pair.originalId)
      const origDied = unit.id === pair.originalId && death.creditIds.includes(pair.twinId)
      if (twinDied || origDied) {
        const killerId = twinDied ? pair.originalId : pair.twinId
        awardAchievement(state, 'the-real-one', state.units[killerId]?.controller ?? opponent(unit.controller))
      }
    }
    // All just for this — a subsurface Root Spider killed by an attacker granted (non-printed) Burrowing
    if (unit.name === 'Root Spider' && (unit.region === 'underground' || unit.region === 'underwater')) {
      for (const kid of death.creditIds) {
        const k = state.units[kid]
        const grantedBurrow = (k?.modifiers ?? []).some((m) => m.kind === 'keyword' && !m.remove && /burrow/i.test(m.keyword ?? ''))
        if (k && grantedBurrow) awardAchievement(state, 'all-just-for-this', k.controller)
      }
    }
    // Linger that! — in one turn, destroy Those Who Linger, its raised Ghoul, and that Ghoul's Skeleton
    const isTwl = unit.name === 'Those Who Linger'
    const isGhoul = unit.name === 'Ghoul' && !!unit.counters?.lingering
    const isSkel = unit.name === 'Skeleton' && !!unit.counters?.lingerSkel
    if (isTwl || isGhoul || isSkel) {
      const f = (state.flow ??= {})
      let t = f.lingerKill as { turn: number; twl?: boolean; ghoul?: boolean; skel?: boolean; seat: PlayerId } | undefined
      if (!t || t.turn !== state.turn) t = f.lingerKill = { turn: state.turn, seat: opponent(unit.controller) }
      if (isTwl) t.twl = true
      if (isGhoul) t.ghoul = true
      if (isSkel) t.skel = true
      if (t.twl && t.ghoul && t.skel) awardAchievement(state, 'linger-that', t.seat)
    }
  } catch { /* cosmetic */ }
}

/** Finalize deaths deferred because their deathrite raised a prompt — the striker stayed in the realm
 *  until the rite fully resolved. Call at the applyAction boundary once the prompt queue is clear. */
/** True if `unit` is still on the board but already DOOMED — it will be removed at the next
 *  state-based check and must never be offered as the (only) candidate of a MANDATORY "choose a unit"
 *  prompt, or answering it soft-locks once it vanishes. Two deferral routes leave a doomed unit in
 *  `state.units`: (1) its death is parked behind a prompt/async-deathrite (`flow.pendingDeaths` /
 *  `deathResolving`), or (2) it has accrued LETHAL damage inside an open damage event or combat batch
 *  (deaths deferred to the event/batch close — see [[simultaneous-damage-events]]) and so isn't in
 *  pendingDeaths yet. Uses the same lethal test as checkStateBased (damage ≥ effDefence). */
export function isDyingUnit(state: GameState, unit: UnitState): boolean {
  if (unit.isAvatar) return false // avatars go to death's door, never removed here
  if (((state.flow?.pendingDeaths ?? []) as { unitId: string }[]).some((d) => d.unitId === unit.id)) return true
  if (((state.flow?.deathResolving ?? []) as string[]).includes(unit.id)) return true
  const def = effDefence(state, unit)
  return unit.damage > 0 && def >= 0 && unit.damage >= def
}

export function completeDeferredDeaths(state: GameState): void {
  if (state.prompts.length > 0) return
  const pending = state.flow?.pendingDeaths as { unitId: string; death: DeathRecord }[] | undefined
  if (!pending?.length) return
  state.flow!.pendingDeaths = []
  state.flow!.deathResolving = []
  for (const p of pending) finalizeDeath(state, p.unitId, p.death)
  checkStateBased(state)
}

/** notify every scripted card in play about a game event */
export function emitEvent(
  state: GameState,
  hook: 'onAnyDeath' | 'onUnitEnters' | 'onSpellCast' | 'onUnitEntersSquare' | 'onCardDrawn' | 'onUnitTapped' | 'onAllyStrikesAvatar' | 'onSitePlayed' | 'onUnitAttacked' | 'onUnitKilled' | 'onSiteDamaged' | 'onUnitDamaged' | 'onLifeLost' | 'onDeathsDoor' | 'onAllyDefends' | 'onDrowned',
  ...args: any[]
): void {
  const listeners: { id: string; name: string; controller: PlayerId }[] = []
  for (const u of Object.values(state.units)) {
    if (!u.silenced) listeners.push({ id: u.id, name: u.name, controller: u.controller })
  }
  for (const s of Object.values(state.sites)) {
    if (s.controller !== null && !siteSilenced(state, s)) listeners.push({ id: s.id, name: s.name, controller: s.controller })
  }
  for (const a of Object.values(state.artifacts)) {
    const controller = a.carriedBy ? state.units[a.carriedBy]?.controller : a.conjuredBy
    if (controller !== undefined && !artifactSilenced(state, a)) listeners.push({ id: a.id, name: a.name, controller })
  }
  for (const r of Object.values(state.auras)) listeners.push({ id: r.id, name: r.name, controller: r.controller })
  // some cards listen from the cemetery (Bone Rabble, Scourge Zombies)
  for (const p of state.players) {
    const seen = new Set<string>()
    for (const cardId of p.cemetery) {
      const name = state.cards[cardId]?.name
      if (!name || seen.has(name)) continue
      seen.add(name)
      if (getScript(name)?.listensFromCemetery) listeners.push({ id: cardId, name, controller: p.id })
    }
  }
  // response spells listen from the HAND (Dodge Roll, Valor)
  for (const p of state.players) {
    const seen = new Set<string>()
    for (const cardId of p.hand) {
      const name = state.cards[cardId]?.name
      if (!name || seen.has(name)) continue
      seen.add(name)
      if (getScript(name)?.listensFromHand) listeners.push({ id: cardId, name, controller: p.id })
    }
  }
  for (const l of listeners) {
    const fn = (getScript(l.name) as any)?.[hook]
    if (fn) {
      // the listener may have left play due to an earlier listener's effect
      const inZone = state.players.some((p) => p.cemetery.includes(l.id) || p.hand.includes(l.id))
      if (!state.units[l.id] && !state.sites[l.id] && !state.artifacts[l.id] && !state.auras[l.id] && !inZone) continue
      fn(makeCtx(state, l.id, l.controller, []), ...args)
    }
  }
}

/** a unit entered the realm by any means */
export function emitUnitEnters(state: GameState, unit: UnitState): void {
  // replacement effects first: the unit may never actually enter the realm
  // (Order of the White Wing — no genesis, no enter-triggers, no Lance)
  for (const u of Object.values(state.units)) {
    const f = getScript(u.name)?.interceptsUnitEnter
    if (f && !u.silenced && u.id !== unit.id && f(state, u.id, unit)) {
      const card = state.cards[unit.cardId]
      delete state.units[unit.id]
      if (card && !card.isToken) state.players[card.owner].banished.push(card.id)
      pushLog(state, null, `${unit.name} is banished before it can enter the realm.`)
      return
    }
  }
  // "provides ①" cards grant their mana the moment they enter the realm,
  // just like sites (Cores FAQ; Älvalinne Dryads)
  const provides = getScript(unit.name)?.extraManaEachTurn
  if (provides && !unit.silenced) {
    const n = typeof provides === 'function' ? provides(state, unit.id) : provides
    if (n > 0) {
      state.players[unit.controller].mana += n
      recordManaGain(state, unit.x, unit.y, unit.region, n) // Finwife/Dryad entering next to the avatar
      pushLog(state, unit.controller, `${unit.name} provides ${n} mana.`)
    }
  }
  emitEvent(state, 'onUnitEnters', unit)
  // Entering the realm also means entering its LOCATION: per the rulebook, a unit
  // "enters" a location when summoned/conjured there, not only when it moves in.
  // Fire onUnitEntersSquare with an off-board `from` (a non-real region) so
  // location-entry site effects (Dark Alley, Old Mortimer's Den, ...) trigger,
  // while region-transit triggers that test `from.region` (Ghost Ship's
  // void-emergence, Khamaseen Mummy's unburrow, Planar Gate) correctly do NOT.
  //
  // DEFER it for a SUMMON/conjure entry (the unit is flagged "entering" while its Genesis — and any
  // prompt the Genesis raises — resolves): the location trigger fires at settleEntering, AFTER the
  // Genesis has FULLY resolved. So a site that kills or relocates on entry (Bottomless Pit, Dark
  // Alley) can't pre-empt the entering minion's Genesis or its target selection. Non-entering emits
  // (a vanilla token appearing, a site transforming into a minion) have no Genesis and fire now.
  if (state.units[unit.id]) {
    const isEntering = ((state.flow?.entering as string[] | undefined) ?? []).includes(unit.id)
    if (isEntering) {
      state.flow.pendingSquareEntry = [...(((state.flow.pendingSquareEntry as string[] | undefined)) ?? []), unit.id]
    } else {
      emitEvent(state, 'onUnitEntersSquare', unit, { x: -1, y: -1, region: 'offboard' as Region })
    }
  }
}

/**
 * Bring a unit into the realm by a NON-CAST means (reanimation, effect-summon,
 * token that has a genesis, steal-into-play, collection-summon, ...). This is the
 * canonical effect-entry path and the counterpart to the CAST path in casting.ts.
 *
 * Rulebook glossary: "Genesis → Triggers when the card enters the realm." The FAQ
 * is explicit that this is NOT cast-specific: Golden Dawn's mass effect-summon
 * says to "resolve any effects of those minions being summoned, e.g. genesis
 * effects" (faq_dump.md:1242), and the Deathspeaker's effect-summon fires the
 * copy's genesis before the banish (faq_dump.md:745,752). So any unit that enters
 * the realm by an effect must fire its genesis, exactly like the cast path.
 *
 * The caller builds the UnitState and passes it here. We:
 *   1) place it in state.units,
 *   2) run emitUnitEnters (which may replace/banish it via interceptsUnitEnter —
 *      e.g. Order of the White Wing — in which case no genesis fires),
 *   3) fire script.genesis ONLY if the unit survived entry and isn't silenced
 *      (mirroring the cast-path guards at casting.ts:903), with a targets-less ctx,
 *   4) checkStateBased.
 *
 * The CAST path deliberately keeps its OWN genesis call — this helper is for
 * NON-cast entries only, so genesis never double-fires. Cast-only riders that are
 * NOT genesis (Mephistopheles' avatar replacement — "Must be cast...", not a
 * Genesis ability; faq_dump.md:1954) live in the separate `castRider` hook and are
 * intentionally NOT fired here.
 *
 * Returns the surviving unit (or null if entry banished/killed it).
 */
/** Mock-Court-style summon taxes: sites with a `summonTax` charge the summoner extra mana for each
 *  unit entering from a NON-cast summon (the cast path taxes via costModifier). We ACCUMULATE the
 *  charge per token into `flow.summonTaxPending` and settle the whole batch in `reconcileSummonTax`
 *  once the action resolves — so a multi-token summon (Plague of Frogs) is reckoned together: if you
 *  can afford ALL you must pay for all (no prompt); if you can't, you're prompted to choose which to
 *  keep. Charging per token here would silently let unpaid tokens through when short. */
export function applySummonTax(state: GameState, unit: UnitState): void {
  if (unit.isAvatar) return
  let tax = 0
  for (const s of Object.values(state.sites)) {
    if (s.controller === null || siteSilenced(state, s)) continue
    const f = getScript(s.name)?.summonTax
    if (f) tax += f(state, s, unit)
  }
  if (tax > 0) {
    state.flow = state.flow ?? {}
    state.flow.summonTaxPending = state.flow.summonTaxPending ?? []
    state.flow.summonTaxPending.push({ unitId: unit.id, player: unit.controller, tax })
  }
}

/** a token that couldn't be paid for never really arrives — pull it back out of the realm without
 *  a cemetery visit (it was a token that failed to enter, not a death). */
function unsummonToken(state: GameState, unitId: string): void {
  const u = state.units[unitId]
  if (!u) return
  if (removeUnitFromRealm(state, unitId)) delete state.units[unitId] // never an avatar (a token), guarded anyway
  if (state.cards[u.cardId]?.isToken) delete state.cards[u.cardId]
}

/** Settle the batch of pending summon taxes (Mock Court) once the summoning action has resolved.
 *  Per summoner: if they can afford EVERY taxed token, pay for all (mandatory, no prompt). If not,
 *  prompt them to choose which of the batch to keep — up to what they can pay — and the rest never
 *  arrive. Call after an action fully settles (game.ts applyAction, when no prompts are pending). */
export function reconcileSummonTax(state: GameState): void {
  const pending = (state.flow?.summonTaxPending ?? []) as { unitId: string; player: PlayerId; tax: number }[]
  if (!pending.length) return
  state.flow!.summonTaxPending = []
  for (const pid of [0, 1] as PlayerId[]) {
    const items = pending.filter((it) => it.player === pid && state.units[it.unitId])
    if (!items.length) continue
    const p = state.players[pid]
    const total = items.reduce((s, it) => s + it.tax, 0)
    if (p.mana >= total) {
      p.mana -= total
      bumpManaSpent(state, pid, total)
      pushLog(state, pid, `Pays ${total} to the Court for summoning.`)
      continue
    }
    // can't cover the whole batch → how many whole tokens can be paid for (taxes are uniform)?
    const each = items[0].tax
    const affordable = Math.max(0, Math.floor(p.mana / each))
    if (affordable === 0) {
      for (const it of items) unsummonToken(state, it.unitId)
      pushLog(state, pid, `Can't pay the Court — the summoned minions never arrive.`)
      continue
    }
    // choose which `affordable` of the batch to keep; the continuation removes the rest
    pushPrompt(state, {
      player: pid,
      kind: 'chooseTargets',
      title: `Mock Court — you can pay (${each}) for ${affordable} of ${items.length} summoned minions. Keep which?`,
      data: { candidates: items.map((it) => it.unitId), count: affordable, kind: 'unit' },
      cont: 'summonTaxChoice',
      ctx: { ids: items.map((it) => it.unitId), each, player: pid },
    })
  }
}

registerCont('summonTaxChoice', (state, c: { ids: string[]; each: number; player: PlayerId }, choice) => {
  const keep = new Set((Array.isArray(choice) ? choice : [choice]).filter((x): x is string => typeof x === 'string'))
  const p = state.players[c.player]
  let paid = 0
  for (const id of c.ids) {
    if (keep.has(id) && state.units[id]) paid += c.each
    else unsummonToken(state, id)
  }
  const afford = Math.min(paid, p.mana)
  p.mana -= afford
  bumpManaSpent(state, c.player, afford)
  pushLog(state, c.player, `Pays ${afford} to the Court; the unpaid minions never arrive.`)
  checkStateBased(state)
})

/** Is this unit hushed by a CONTINUOUS silencing static right now (a Silent Hills / Bower of Bliss
 *  site, a Sisters-of-Silence unit, a silencing aura or carried artifact)? Distinct from the
 *  `unit.silenced` flag, which checkStateBased only sets on its next pass — this reads the statics
 *  LIVE. Used to block the Genesis of a minion entering an already-silenced location (a silenced
 *  minion has no abilities, so no Genesis fires), and by checkStateBased itself to set the flag. */
export function hushedByStatic(state: GameState, u: UnitState): boolean {
  if (u.isAvatar) return false
  for (const s of Object.values(state.sites)) {
    const f = getScript(s.name)?.silencesUnit
    if (f && s.controller !== null && !s.isRubble && !siteSilenced(state, s) && f(state, s.id, u)) return true
  }
  for (const o of Object.values(state.units)) {
    if (o.id === u.id || o.silenced) continue
    const f = getScript(o.name)?.silencesUnit
    if (f && f(state, o.id, u)) return true
  }
  for (const r of Object.values(state.auras)) {
    const f = getScript(r.name)?.silencesUnit
    if (f && f(state, r.id, u)) return true
  }
  for (const artId of u.carrying) {
    const art = state.artifacts[artId]
    const f = art ? getScript(art.name)?.silencesUnit : undefined
    if (f && f(state, art.id, u)) return true
  }
  return false
}

/** Does a minion ENTERING the realm fire its Genesis? It doesn't when it has no abilities to fire:
 *  it is silenced, hushed by a static silence (Silent Hills), or already disabled by an OUTSIDE
 *  source (an area-disable, atop a burrowed Root Spider). This is the SINGLE predicate both entry
 *  paths must share — a real cast (castSpell) and an effect-summon (effectSummonUnit) — so a
 *  Slumbering Giantess summoned already-disabled never adds her own sleep on either path. Both callers
 *  set `flow.entering` first, so an "at rest" disabler (Hillock Basilisk) is correctly skipped here. */
export function firesGenesisOnEntry(state: GameState, unit: UnitState): boolean {
  return !unit.silenced && !hushedByStatic(state, unit) && !isDisabled(state, unit)
}

/** Site-level summon bans (No Man's Land): may a minion be summoned to (x,y,region)? A summon is a
 *  summon whether cast by a player or created by an effect (Boulevard of Bones' Skeleton, reanimation,
 *  conjuring…), so effect-summons consult this too — not just the player-cast validation. */
export function summonBlockedAt(state: GameState, at: { x: number; y: number; region?: Region }): boolean {
  for (const s of Object.values(state.sites)) {
    const block = getScript(s.name)?.blockSummon
    if (block && !siteSilenced(state, s) && block(state, s, at)) return true
  }
  return false
}

export function effectSummonUnit(state: GameState, unit: UnitState, genesisTargets: TargetRef[] = []): UnitState | null {
  if (summonBlockedAt(state, unit)) return null // No Man's Land etc. forbid a summon here — nothing enters
  state.units[unit.id] = unit
  // it is entering — not yet "at rest", so an "at rest" disabler (Hillock Basilisk) doesn't bite it
  // until it settles: its Genesis fires first, THEN it's disabled once it comes to rest.
  state.flow = state.flow ?? {}
  const prevActing = state.flow.actingUnitId
  state.flow.actingUnitId = unit.id
  // mark it ENTERING so an "at rest" disabler (Hillock Basilisk / Stone-Gaze Gorgons) can't bite it
  // until its Genesis — INCLUDING any prompt the Genesis raises — has fully resolved. Removed inline
  // when the Genesis needs no choice; otherwise via a deferred settle step once the prompt chain drains.
  state.flow.entering = [...(((state.flow.entering as string[] | undefined)) ?? []), unit.id]
  emitUnitEnters(state, unit)
  if (state.units[unit.id]) applySummonTax(state, unit)
  // the unit may have been banished before it could enter (replacement effect)
  const survived = state.units[unit.id]
  const promptsBefore = state.prompts.length
  // a minion that enters with no abilities fires no Genesis: silenced (Silent Hills / Sister
  // Stefánia) OR disabled by another source (an area-disable, a sleep spell). A disabled Slumbering
  // Giantess must not add her own "fall asleep" — so lifting the outside condition leaves her active.
  // ("at rest" disables are skipped here via `entering`, so a minion summoned into a Basilisk's zone
  // still fires its Genesis.)
  if (survived && firesGenesisOnEntry(state, survived)) {
    const genesis = getScript(survived.name)?.genesis
    if (genesis) genesis(makeCtx(state, survived.id, survived.controller, genesisTargets))
  }
  state.flow.actingUnitId = prevActing
  if (state.prompts.length > promptsBefore) {
    deferTurnStep(state, 'summon:settle', { unitId: unit.id }) // stay "entering" until the Genesis prompt(s) drain
  } else {
    settleEntering(state, unit.id) // Genesis done → it comes to rest now (an at-rest disabler bites here)
  }
  checkStateBased(state)
  return state.units[unit.id] ?? null
}
/** A just-summoned unit "comes to rest": it stops being exempt from at-rest disablers. Runs inline once
 *  its Genesis needs no choice, or as a deferred turn-step after the Genesis prompt chain drains. */
export function settleEntering(state: GameState, unitId: string): void {
  if (state.flow?.entering) state.flow.entering = (state.flow.entering as string[]).filter((id) => id !== unitId)
  // the unit's Genesis — including any prompt it raised — is fully resolved now, so fire its DEFERRED
  // location-entry trigger (see emitUnitEnters): a site that kills or relocates on entry (Bottomless
  // Pit, Dark Alley) only acts once the Genesis has completely resolved and chosen its targets.
  const pend = state.flow?.pendingSquareEntry as string[] | undefined
  if (pend?.includes(unitId)) {
    state.flow.pendingSquareEntry = pend.filter((id) => id !== unitId)
    const u = state.units[unitId]
    if (u) emitEvent(state, 'onUnitEntersSquare', u, { x: -1, y: -1, region: 'offboard' as Region })
  }
}
registerCont('summon:settle', (state, ctx: { unitId: string }) => {
  settleEntering(state, ctx.unitId)
  checkStateBased(state)
})

/** a unit changed square/region. `via` distinguishes a BASIC move action ('move' — the unit's own
 *  Move / Move-and-Attack) from any other relocation ('forced' — teleport, pull, blown by a site…). */
export function emitUnitMoved(state: GameState, unit: UnitState, from: { x: number; y: number; region: Region }, via: 'move' | 'forced' = 'forced', final = true): void {
  if (unit.x === from.x && unit.y === from.y && unit.region === from.region) return
  // an Enchantress "aura minion" drags its aura's AREA along as it moves, so the
  // enchantment's effect follows the creature (its footprint is the aura's area).
  const auraId = unit.counters?.animatedAura ? String(unit.counters.animatedAura) : null
  if (auraId && state.auras[auraId]) {
    const aura = state.auras[auraId]
    if (aura.edge && unit.extraSquares?.[0]) {
      aura.edge = { a: { x: unit.x, y: unit.y }, b: { x: unit.extraSquares[0].x, y: unit.extraSquares[0].y } }
      aura.squares = [{ x: unit.x, y: unit.y }, { x: unit.extraSquares[0].x, y: unit.extraSquares[0].y }] // wall = 2x1
    } else if (unit.size === '2x2') {
      aura.anchor = { x: unit.x, y: unit.y }
      aura.squares = occupiedSquares(unit)
    } else {
      delete aura.anchor
      aura.squares = [{ x: unit.x, y: unit.y }]
    }
    // A SITE-anchored 1x1 aura (Wildfire) tracks the SITE it sits on (`onSiteId`) and the sites it has
    // burned (`counters['s:<id>']`). When its animated creature MOVES, re-anchor to the site now under
    // it and scorch that site — otherwise `onSiteId` stays on the OLD site and the end-of-turn
    // re-derive snaps the fire back off the creature (and the move never marks the new site visited).
    if (aura.onSiteId !== undefined) {
      const under = siteAt(state, unit.x, unit.y)
      if (under) {
        aura.onSiteId = under.id
        aura.counters = { ...(aura.counters ?? {}), [`s:${under.id}`]: 1 }
      }
    }
  }
  // `final` is false ONLY for an intermediate step of a multi-step walk — so triggers that fire
  // when a unit STOPS on a square (Vaults of Zul, Flame of the First Ones) can ignore pass-throughs.
  // Teleports, forced relocations, and summons emit with final=true (the unit comes to rest there).
  emitEvent(state, 'onUnitEntersSquare', unit, from, via, final)
}

export function banishUnit(state: GameState, unitId: string): void {
  const unit = state.units[unitId]
  if (!unit || unit.isAvatar) return
  if (getScript(unit.name)?.unbanishable && !unit.silenced) {
    pushLog(state, unit.controller, `${unit.name} cannot be banished.`)
    return
  }
  removeUnitFromRealm(state, unitId)
  const card = state.cards[unit.cardId]
  if (card && !card.isToken) state.players[card.owner].banished.push(card.id)
  delete state.units[unitId]
  pushLog(state, null, `${unit.name} is banished.`)
}

export function bounceUnit(state: GameState, unitId: string): void {
  const unit = state.units[unitId]
  if (!unit || unit.isAvatar) return
  removeUnitFromRealm(state, unitId)
  const card = state.cards[unit.cardId]
  if (card && !card.isToken) state.players[card.owner].hand.push(card.id)
  delete state.units[unitId]
  pushLog(state, null, `${unit.name} returns to its owner's hand.`)
}

/** A unit is leaving the realm (banish, exile, bounce, transform, custom removal): drop
 *  everything it carries — artifacts AND carried units — IN PLACE so they REMAIN in the
 *  realm (rulebook FAQ: Cast into Exile / Fey Changeling / Monster Hunter), and detach it
 *  from any carrier. Call this before any `delete state.units[id]` in a card script. */
export function removeUnitFromRealm(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId]
  if (!unit) return false
  // an Avatar never leaves the realm by a card effect (only a death blow at death's door defeats it).
  // Returning false lets callers gate their `delete state.units[id]` so no card can remove an avatar.
  if (unit.isAvatar) return false
  for (const artId of unit.carrying) {
    const art = state.artifacts[artId]
    if (art) {
      art.carriedBy = null
      art.x = unit.x
      art.y = unit.y
      art.region = unit.region
    }
  }
  unit.carrying = []
  dropAllCarriedUnits(state, unit)
  detachFromCarrier(state, unit)

  // An animated aura minion (Enchantress) IS its enchantment — the unit and the aura are ONE object.
  // Whenever that minion leaves the realm by ANY means — death, Bury/flood taking it off the surface,
  // banish, exile-to-hand, transform — the aura must die with it. This is intrinsic to removal, never
  // conditional on the animator (Enchantress) still being in play, which is the trap the old
  // Enchantress-only `onAnyDeath` listener fell into: it missed every death where the Enchantress had
  // left, and every NON-death removal (which skips onAnyDeath). The legitimate "animation expires →
  // dissolve back into a plain aura" path deletes the unit DIRECTLY (never calls this), so it keeps
  // the aura as intended.
  const animatedAuraId = unit.counters?.animatedAura ? String(unit.counters.animatedAura) : null
  if (animatedAuraId) delete state.auras[animatedAuraId]

  // Tide Naiads flood the site they occupy ("this site is flooded") — the water EBBS when the Naiads
  // leave the realm by any means. This is a consequence of leaving (not a printed deathrite — the card
  // has none), so it belongs here, firing on every exit and regardless of silence/disable.
  const naiadSite = unit.counters?.naiadSite
  if (naiadSite !== undefined) {
    const site = state.sites[`s${naiadSite}`]
    // don't drain if ANOTHER source still floods it (a second Naiads, a Waveshaper, a Floodplain flood…)
    if (site) site.flooded = siteStillFlooded(state, site.id, { excludeUnit: unit.id })
  }

  // Continuous control effects (King of the Realm / Returned King "you control all X"):
  // when the controlling source LEAVES the realm — dies OR exits (banish/bounce) — the
  // minions it claimed return to their previous controller. Keyed on `by` = the source's
  // unit id, so several such lords coexist and only the departing one's court disbands.
  // Also drop any ledger entry for the leaving unit itself.
  const ledger = state.flow?.kingsCourt as { unitId: string; back: PlayerId; by?: string }[] | undefined
  if (ledger?.length) {
    state.flow!.kingsCourt = ledger.filter((rec) => {
      if (rec.by === unitId) {
        const u = state.units[rec.unitId]
        if (u && u.id !== unitId) { u.controller = rec.back; pushLog(state, rec.back, `${u.name} slips free as its lord leaves the realm.`) }
        return false // court disbands
      }
      return rec.unitId !== unitId // the claimed unit itself left → forget it
    })
  }
  return true
}

/** Vindictive Nation: sites in play get told when any site is modified, moved
 *  or destroyed, and by whom */
export function notifySiteInterference(
  state: GameState,
  kind: 'modify' | 'move' | 'destroy',
  site: { id: string; x: number; y: number; controller: PlayerId | null },
  by: PlayerId | null,
): void {
  for (const s of Object.values(state.sites)) {
    const hook = getScript(s.name)?.onSiteInterference
    if (hook && !s.isRubble && s.controller !== null && !siteSilenced(state, s)) {
      hook(makeCtx(state, s.id, s.controller, []), kind, site, by)
    }
  }
}

/** can this site be moved/rearranged? Bedrock (immovableSite) and units that IMMOBILIZE a site (Bluecap
 *  Knockers — "can't be moved…") say no. A unit that only protects from DESTRUCTION (Order of the Sacred
 *  Oak) does NOT block moving — its sites stay movable and modifiable. */
export function siteCantBeMoved(state: GameState, site: { id: string; name: string; x: number; y: number }): boolean {
  if (getScript(site.name)?.immovableSite) return true
  for (const u of Object.values(state.units)) {
    const immobilize = getScript(u.name)?.immobilizesSite
    if (immobilize && !u.silenced && !isDisabled(state, u) && immobilize(state, u, site)) return true
  }
  return false
}

// Bedrock: "Can't be ... modified." Its rarity/abilities never change — it can't
// be flooded, silenced, transformed, or granted abilities (FAQ: "Bedrock wins,
// and is not modified in any way"). Looks up the site by name OR by square, so
// callers holding only a location (e.g. siteSilenced) can query it too.
// Show the cards currently in `ownerToReveal`'s hand to `viewer` (Lookout,
// Accusation, The Inquisition). Reveal is per card INSTANCE and persists while
// the card stays in hand — you remember the specific cards you saw; cards drawn
// later aren't revealed. viewFor keys off the current hand, so a played card
// simply stops being shown.
export function revealHand(state: GameState, ownerToReveal: PlayerId, viewer: PlayerId): void {
  state.handReveals = state.handReveals ?? {}
  for (const id of state.players[ownerToReveal].hand) {
    const seen = state.handReveals[id] ?? (state.handReveals[id] = [])
    if (!seen.includes(viewer)) seen.push(viewer)
  }
}

/** A card publicly REVEALS one or more cards by name (Common Sense's tutor, Black Mass's
 *  draws…). Recorded in `flow.reveals` — public info, so every client can pop a "your
 *  opponent revealed…" notice showing the card(s). Keyed by a monotonic `n` for de-dup;
 *  only the last few are kept. viewFor exposes it to everyone. */
export function revealCards(state: GameState, by: PlayerId, names: string[]): void {
  const clean = names.filter(Boolean)
  if (!clean.length) return
  state.flow = state.flow ?? {}
  const n = (state.flow.revealN ?? 0) + 1
  state.flow.revealN = n
  state.flow.reveals = [...(state.flow.reveals ?? []), { by, names: clean, n }].slice(-8)
}

export function siteCantBeModified(state: GameState, site: { name?: string; x: number; y: number }): boolean {
  const name = site.name ?? Object.values(state.sites).find((s) => s.x === site.x && s.y === site.y && !s.isRubble)?.name
  return !!name && !!getScript(name)?.unmodifiableSite
}

/** `site.flooded` is a single flag toggled by SEVERAL independent, overlapping sources, so when one
 *  source stops the site must stay flooded if any OTHER source still applies. This re-derives that from
 *  the tracked continuous sources: The Flood (realm-wide), a Tide Naiads standing on it, a Waveshaper's
 *  standing wave, and any still-active end-of-turn flood (Floodplain, Wave of Eviction). `excludeUnit`
 *  skips a Naiads that is itself leaving; `excludeEndOfTurn` skips the end-of-turn floods that are the
 *  ones currently expiring. (Naturally-water sites read as water via their threshold regardless of this
 *  flag, so draining one is harmless.) */
export function siteStillFlooded(state: GameState, siteId: string, opts?: { excludeUnit?: string; excludeEndOfTurn?: boolean }): boolean {
  if (state.flow?.realmFlooded) return true
  const num = Number(siteId.slice(1))
  if (!Number.isNaN(num) && Object.values(state.units).some((u) => u.counters?.naiadSite === num && u.id !== opts?.excludeUnit)) return true
  const ws = state.flow?.waveshaperFlood as Record<string, string> | undefined
  if (ws && Object.values(ws).includes(siteId)) return true
  if (!opts?.excludeEndOfTurn && ((state.flow?.unfloodAtEnd ?? []) as string[]).includes(siteId)) return true
  return false
}

// Flood a site, honoring "can't be modified" (Bedrock): the wave washes over but
// can't stick — non-submerge surface minions still get knocked over (tapped) per
// FAQ, then the water dissipates. Returns whether the site actually stayed flooded.
export function applyFlood(state: GameState, site: SiteState, by: PlayerId): boolean {
  if (site.isRubble && siteCantBeModified(state, site)) return false
  if (!site.isRubble && siteCantBeModified(state, site)) {
    for (const u of unitsAt(state, site.x, site.y, 'surface')) {
      if (!u.isAvatar && !effKeywords(state, u).submerge) u.tapped = true
    }
    pushLog(state, by, `${site.name} can't be flooded.`)
    return false
  }
  site.flooded = true
  return true
}

export function destroySite(state: GameState, siteId: string, sourcePlayer?: PlayerId, sacrifice = false): void {
  const site = state.sites[siteId]
  if (!site) return
  // A SACRIFICE is a willing cost, not destruction (Sinkhole/Vesuvius giving up their own site), so it
  // bypasses "can't be destroyed" (Bedrock) and destruction-protection (Order of the Sacred Oak / Bluecap)
  // — mirroring the unit-sacrifice rule. A normal destroy effect still respects both.
  if (!sacrifice) {
    // indestructible sites (Bedrock) and protected sites (Bluecap Knockers / Order of the Sacred Oak)
    if (getScript(site.name)?.indestructibleSite) {
      pushLog(state, sourcePlayer ?? null, `${site.name} cannot be destroyed.`)
      return
    }
    for (const u of Object.values(state.units)) {
      const protect = getScript(u.name)?.protectsSite
      if (protect && !u.silenced && !isDisabled(state, u) && protect(state, u, site)) {
        pushLog(state, sourcePlayer ?? null, `${site.name} is protected by ${u.name}.`)
        return
      }
    }
  }
  if (checkWard(state, site, sourcePlayer, site.controller, 'destroy')) {
    pushLog(state, sourcePlayer ?? null, `${site.name}'s ward breaks.`)
    return
  }
  const { x, y } = site
  // Vindictive Nation hears the walls come down while everything still stands
  notifySiteInterference(state, 'destroy', site, sourcePlayer ?? null)
  toCemetery(state, site.cardId)
  delete state.sites[siteId]
  // destroyed sites leave rubble, not void
  const rubbleCardId = newId(state, 'c')
  state.cards[rubbleCardId] = { id: rubbleCardId, name: 'Rubble', owner: site.owner, isToken: true }
  const rubbleId = newId(state, 's')
  state.sites[rubbleId] = {
    id: rubbleId,
    cardId: rubbleCardId,
    name: 'Rubble',
    owner: site.owner,
    controller: null,
    x,
    y,
    tapped: false,
    isRubble: true,
  }
  pushLog(state, null, `${site.name} is destroyed and reduced to rubble.`)
  // "when this site is destroyed" (Roots of Yggdrasil)
  const hook = getScript(site.name)?.onSelfDestroyed
  if (hook) hook(makeCtx(state, siteId, site.controller ?? sourcePlayer ?? 0, []), { x, y })
  checkStateBased(state)
}

// ---- state-based checks ----

export function checkStateBased(state: GameState): void {
  if (state.phase === 'over') return
  sbDepth++
  try {
  // Orphaned cargo safety net: if a carried artifact or unit's CARRIER has left the realm
  // (banish, exile, transform, or any custom removal), it REMAINS in the realm — drop it in
  // place. syncCarried keeps cargo at its carrier's square, so its current x/y is where it
  // lands. Also prune dead ids from any carrier's manifest. Rulebook FAQ: Cast into Exile /
  // Fey Changeling / Monster Hunter. (Removal helpers already drop cleanly; this catches the
  // card scripts that delete a unit directly.)
  for (const art of Object.values(state.artifacts)) {
    if (art.carriedBy && !state.units[art.carriedBy]) art.carriedBy = null
  }
  for (const u of Object.values(state.units)) {
    if (u.carriedBy && !state.units[u.carriedBy]) u.carriedBy = null
    if (u.carrying?.length) u.carrying = u.carrying.filter((id) => state.artifacts[id])
    if (u.carryingUnits?.length) u.carryingUnits = u.carryingUnits.filter((id) => state.units[id])
  }
  // Magellan Globe edge-wrap is dynamic: re-derive each standard 2x2 aura's coverage
  // from its stored anchor so it extends across / retracts from the far edge as the
  // Globe enters or leaves play. Only reconcile auras whose squares still match their
  // anchor's 2x2 (clipped or wrapped) — a self-managed/moved aura is left alone.
  {
    const wrap = edgesConnected(state)
    for (const aura of Object.values(state.auras)) {
      if (!aura.anchor) continue
      const clipped = aura2x2Squares(aura.anchor, false)
      const wrapped = aura2x2Squares(aura.anchor, true)
      const cur = new Set(aura.squares.map((s) => `${s.x},${s.y}`))
      const eq = (arr: { x: number; y: number }[]) => arr.length === cur.size && arr.every((s) => cur.has(`${s.x},${s.y}`))
      if (eq(clipped) || eq(wrapped)) aura.squares = wrap ? wrapped : clipped
    }
  }
  // Index of active disable SOURCES (units/artifacts/auras carrying a disable hook,
  // plus area-disables). disabledByEffect iterates ONLY these — so on the common
  // board with no disablers it's O(1), and otherwise it checks a handful, not every
  // unit. Recomputed here each time the board settles; disabledByEffect falls back to
  // a full scan if the index is somehow absent.
  {
    const u: string[] = []
    const a: string[] = []
    const r: string[] = []
    for (const unit of Object.values(state.units)) if (getScript(unit.name)?.disablesOther) u.push(unit.id)
    for (const art of Object.values(state.artifacts)) if (!art.carriedBy && artScript(state, art)?.disablesOther) a.push(art.id)
    for (const aura of Object.values(state.auras)) if (getScript(aura.name)?.auraDisablesUnit) r.push(aura.id)
    state.flow = state.flow ?? {}
    // stamp with nextId (bumps on every entity creation) so disabledByEffect trusts
    // the index only while no new source has entered since; otherwise it full-scans.
    state.flow.disablerIndex = { gen: state.nextId, u, a, r, area: (state.flow.areaDisables?.length ?? 0) > 0 }
  }
  // Index of static keyword/power GRANT + keyword-REMOVE sources — the entities that own a
  // grantsKeywords/grantsPower/aura|site|artifactGrants*/removesKeywords hook. effKeywords/powerModifiers
  // iterate ONLY these (see statics.ts grantSources/removeSources) instead of the whole board, so the
  // common board (vanilla minions + self-conditional cards) costs O(1). Same gen-stamp + full-scan
  // fallback as disablerIndex; self-only granters are excluded (applied via direct self-eval).
  state.flow.staticGrantIndex = buildStaticGrantIndex(state)
  // continuous silencing statics (Bower of Bliss, Sisters of Silence): units
  // hushed by a silencesUnit hook carry a marker so the hush lifts when the
  // silencer leaves
  for (const u of Object.values(state.units)) {
    if (u.isAvatar) continue
    // a unit that "can't be silenced" (Monks of Kobalsa, Bedrock, an Onslaught'd ally…) — a silencing
    // static (Root Spider, Bower of Bliss, Sisters of Silence) simply doesn't touch it.
    const hush = hushedByStatic(state, u) && !silenceImmune(state, u)
    if (hush && !u.silenced) {
      u.silenced = true
      u.counters = { ...u.counters, hushed: 1 }
    } else if (!hush && u.counters?.hushed) {
      u.silenced = undefined
      delete u.counters.hushed
    }
  }
  // permanent Stealth-stripping statics from sites (Watchtower)
  for (const site of Object.values(state.sites)) {
    if (site.isRubble || site.controller === null || siteSilenced(state, site)) continue
    const mode = getScript(site.name)?.stripStealth
    if (!mode) continue
    for (const u of Object.values(state.units)) {
      if (!u.stealth || u.controller === site.controller || u.region !== 'surface') continue
      const near = nearbySquaresW(state, site.x, site.y).some((s) => s.x === u.x && s.y === u.y)
      if ((mode === 'global' || near) && siteAt(state, u.x, u.y)) {
        u.stealth = false
        pushLog(state, site.controller, `${u.name} is spotted from ${site.name}!`)
      }
    }
  }
  // permanent Stealth-stripping statics (Master Tracker, Hunting Party...)
  for (const stripper of Object.values(state.units)) {
    if (stripper.silenced) continue
    const mode = getScript(stripper.name)?.stripStealth
    if (mode) {
      for (const u of Object.values(state.units)) {
        if (!u.stealth || u.controller === stripper.controller) continue
        const near = nearbySquaresW(state, stripper.x, stripper.y).some((s) => s.x === u.x && s.y === u.y)
        if (mode === 'global' || near) {
          u.stealth = false
          pushLog(state, stripper.controller, `${u.name} is spotted by ${stripper.name}!`)
        }
      }
    }
    // Ward-stripping statics (Order of the Pale Worm)
    if (getScript(stripper.name)?.stripWard) {
      for (const u of Object.values(state.units)) {
        if (u.ward && nearbySquaresW(state, stripper.x, stripper.y).some((s) => s.x === u.x && s.y === u.y)) {
          u.ward = false
          pushLog(state, stripper.controller, `${u.name}'s ward gutters out.`)
        }
      }
      for (const s of Object.values(state.sites)) {
        if (s.ward && nearbySquaresW(state, stripper.x, stripper.y).some((q) => q.x === s.x && q.y === s.y)) {
          s.ward = false
          pushLog(state, stripper.controller, `${s.name}'s ward gutters out.`)
        }
      }
    }
  }
  // Ward is an ABILITY (like Stealth): a minion or site that becomes disabled or
  // silenced loses all abilities, so its Ward mark gutters out. Only warded things
  // are checked (cheap), and once lost it stays lost until re-warded. (A minion still
  // ENTERING isn't yet "at rest", so an at-rest disabler doesn't count against it here —
  // that exemption lives in disabledByEffect, so a just-cast Archangel Michael keeps its Ward
  // while its Genesis resolves; it only loses it if it truly comes to rest still disabled.)
  for (const u of Object.values(state.units)) {
    if (!u.ward) continue
    // Ward is an ability: only a DISABLED (or silenced) minion loses it. A Basilisk's at-rest gaze
    // disables a unit sitting still (→ ward gone), but a unit that is acting / entering / PARTAKING IN
    // A BATTLE is not disabled, so it KEEPS its ward for that fight (isDisabled already exempts those).
    if (u.silenced || isDisabled(state, u)) {
      u.ward = false
      pushLog(state, u.controller, `${u.name} loses its ward.`)
    }
  }
  for (const s of Object.values(state.sites)) {
    if (!s.ward) continue
    if (s.isRubble || siteSilenced(state, s)) {
      s.ward = false
      if (s.controller !== null) pushLog(state, s.controller, `${s.name} loses its ward.`)
    }
  }
  // Stealth is likewise an ability (Codex: "similar to Ward"): a minion that becomes
  // disabled or silenced loses its Stealth token. Once removed it stays gone even if the
  // silence/disable later lifts — it does NOT auto-return (FAQ: "permanently lose stealth
  // = remove the token; it can gain stealth later"). This covers Jack the Ripper cast to a
  // Mortal on a square that silences/disables HIM: his kill still resolves (it was placed
  // on the storyline at cast, and a silenced minion may still kill), but he is revealed.
  for (const u of Object.values(state.units)) {
    if (!u.stealth) continue
    if (u.silenced || isDisabled(state, u)) {
      u.stealth = false
      pushLog(state, u.controller, `${u.name} is revealed — its Stealth is broken.`)
    }
  }
  // A continuous "you control all X" ability (Pied Piper) is an ability too: a silenced or disabled
  // lord loses it, so its claimed court reverts to each minion's previous controller — exactly like
  // Ward/Stealth above. Only opted-in lords (releaseControlWhenHushed) release here, since they
  // re-establish their court on their next sweep; a one-shot claimer (Returned King) is left alone.
  // Leaving the realm is handled separately in removeUnitFromRealm.
  {
    const court = state.flow?.kingsCourt as { unitId: string; back: PlayerId; by?: string }[] | undefined
    if (court?.length) {
      state.flow!.kingsCourt = court.filter((rec) => {
        const lord = rec.by ? state.units[rec.by] : undefined
        if (lord && getScript(lord.name)?.releaseControlWhenHushed && (lord.silenced || isDisabled(state, lord))) {
          const u = state.units[rec.unitId]
          if (u && u.controller !== rec.back) {
            u.controller = rec.back
            pushLog(state, rec.back, `${u.name} slips free as ${lord.name} falls silent.`)
          }
          return false
        }
        return true
      })
    }
  }
  // A carrier drags everything it carries wherever it goes — moved, pushed, burrowed,
  // submerged, teleported, willing or not. Re-anchor each carrier's cargo (artifacts
  // AND swallowed/carried units, recursively) to the carrier's square + region, so a
  // region change like Cave-In's burrow takes the carried artifacts down with it.
  for (const u of Object.values(state.units)) {
    if (!u.carriedBy && (u.carrying.length > 0 || u.carryingUnits.length > 0)) syncCarried(state, u)
  }
  // conditional control reversions (Love Potion charms, Infiltrate)
  if (state.flow?.charms?.length) {
    state.flow.charms = state.flow.charms.filter((c: any) => {
      const u = state.units[c.unitId]
      if (!u) return false
      if (!state.units[c.anchorId]) {
        u.controller = c.to
        pushLog(state, c.to, `${u.name}'s charm is broken.`)
        return false
      }
      return true
    })
  }
  // leashed units (Apostles' Angel) are banished when their anchor leaves
  if (state.flow?.leashes?.length) {
    state.flow.leashes = state.flow.leashes.filter((l: any) => {
      const u = state.units[l.unitId]
      if (!u) return false
      if (!state.units[l.anchorId]) {
        banishUnit(state, u.id)
        return false
      }
      return true
    })
  }
  if (state.flow?.infiltrations?.length) {
    state.flow.infiltrations = state.flow.infiltrations.filter((c: any) => {
      const u = state.units[c.unitId]
      if (!u) return false
      if (!u.stealth) {
        u.controller = c.to
        pushLog(state, c.to, `${u.name}'s cover is blown — it returns to its owner.`)
        return false
      }
      return true
    })
  }
  // Cage of Sidrak: locked minions are carried by the Cage — they ride with it and stay tapped +
  // disabled (the disable is the Cage's disablesOther keyed on counters.caged). If the Cage has
  // left the realm they are freed (link dropped, caged marker cleared); if a linked minion is gone
  // its link is dropped; otherwise the minion is kept on the Cage's square (drag-with-cage). A
  // teleport OUT already dropped the link in ctx.teleport, so it is not dragged back here.
  if (state.flow?.cagedUnits?.length) {
    state.flow.cagedUnits = (state.flow.cagedUnits as { unitId: string; cageId: string }[]).filter((c) => {
      const u = state.units[c.unitId]
      if (!u) return false
      const cage = state.artifacts[c.cageId]
      if (!cage) {
        if (u.counters) delete u.counters.caged
        pushLog(state, u.controller, `${u.name} is freed as the Cage of Sidrak is undone.`)
        return false
      }
      u.x = cage.x
      u.y = cage.y
      u.region = cage.region ?? 'surface'
      u.tapped = true
      u.counters = { ...u.counters, caged: 1 }
      return true
    })
  }
  // caster-locked spells live in the caster's own zone (Morgana/Omphalos/Gabriel).
  // When that caster leaves the realm, its zone is gone: the spells go to the
  // owner's cemetery. A loaded collection-cast copy (Silver Bullet/Toolbox/Malleus
  // lend) instead simply vanishes with its caster. Silenced/disabled ≠ gone.
  if (state.flow?.lockedCards?.length) {
    const survivors: any[] = []
    for (const l of state.flow.lockedCards as { cardId: string; casterId: string }[]) {
      if (state.units[l.casterId] || state.artifacts[l.casterId]) {
        survivors.push(l)
        continue
      }
      const card = state.cards[l.cardId]
      const holder = state.players.find((p) => p.hand.includes(l.cardId))
      if (card && holder) {
        holder.hand.splice(holder.hand.indexOf(l.cardId), 1)
        if ((state.flow?.lends ?? []).some((e: any) => e.cardId === l.cardId)) {
          state.flow.lends = (state.flow.lends ?? []).filter((e: any) => e.cardId !== l.cardId)
          pushLog(state, holder.id, `${card.name} fades — the caster that loaded it is gone.`)
        } else {
          state.players[card.owner].cemetery.push(l.cardId)
          pushLog(state, holder.id, `${card.name} is discarded — only its bonded caster could cast it.`)
        }
      }
    }
    state.flow.lockedCards = survivors
  }
  let changed = true
  let guard = 0
  while (changed && guard++ < 20) {
    changed = false
    for (const unit of Object.values(state.units)) {
      // A square with a site has no void: anything left in the void of a sited square
      // is placed atop it (rulebook). Do this before region-legality so voidwalkers
      // don't linger in a phantom void — and so non-voidwalkers gifted/summoned to them
      // aren't wrongly banished. Applies to avatars too (site played onto a void avatar).
      // EXCEPTION — "The Void" (siteAlsoVoid): that site's surface/subsurface ALSO count as void, so
      // the void there is real and we must NOT lift a unit out of it.
      if (unit.region === 'void' && siteAt(state, unit.x, unit.y) && !isVoidAt(state, unit.x, unit.y)) {
        unit.region = 'surface'
        for (const artId of unit.carrying) {
          const art = state.artifacts[artId]
          if (art) art.region = 'surface'
        }
        changed = true
      }
      // "The Void" (siteAlsoVoid): its locations also count as void, so a minion WITHOUT Voidwalk
      // standing on it — whatever region — is banished, exactly like one in an empty void square (FAQ).
      // (Avatars are never banished; a carried unit rides its carrier and is handled with it.)
      if (!unit.isAvatar && !unit.carriedBy && siteAt(state, unit.x, unit.y)
          && isVoidAt(state, unit.x, unit.y) && !effKeywords(state, unit).voidwalk) {
        banishUnit(state, unit.id)
        changed = true
        continue
      }
      // Subsurface terrain flip: the underground and underwater levels of a square are
      // the SAME physical subsurface — only the label follows the site's terrain. When a
      // site floods (land→water) or is drained by Drought (water→land), a unit already in
      // that subsurface flips region to match. A creature that can live in the new
      // subsurface stays there — e.g. a burrowed unit that ALSO has Submerge becomes
      // submerged when its site floods, instead of drowning — while one that can't falls
      // through to the death check below. Oversized units flip only if their whole
      // footprint is the new terrain (same rule as a forced Bury/Drown).
      if (unit.region === 'underground' || unit.region === 'underwater') {
        const kw = effKeywords(state, unit)
        const terrain = terrainAt(state, unit.x, unit.y)
        const flipTo =
          unit.region === 'underground' && terrain === 'water' && kw.submerge
            ? 'underwater'
            : unit.region === 'underwater' && terrain === 'land' && kw.burrowing
              ? 'underground'
              : null
        if (flipTo && footprintAllTerrain(state, unit, terrain)) {
          unit.region = flipTo
          for (const artId of unit.carrying) {
            const art = state.artifacts[artId]
            if (art) art.region = flipTo
          }
          changed = true
        }
      }
      if (unit.isAvatar) {
        // An avatar flipped to a side it doesn't have (an Imposter that used Druid's Bruin flip) is a
        // blanked husk: its controller no longer has an Avatar in play and loses the game (FAQ). This is
        // NOT a death blow — no damage, so Altar of Malachai can't save it — the loss is immediate. (A
        // real double-face like the Druid keeps a valid back side and is unaffected.)
        if ((state.phase as string) !== 'over' && unit.flipped && !findCard(unit.name)?.flipText) {
          state.winner = opponent(unit.controller)
          state.phase = 'over'
          pushLog(state, unit.controller, `${state.players[unit.controller].name}'s Imposter flips to a faceless husk — with no Avatar in play, they lose the game!`)
          changed = true
        }
        continue
      }
      // lethal accumulated damage
      if (unit.damage >= effDefence(state, unit) && effDefence(state, unit) >= 0 && unit.damage > 0) {
        killUnit(state, unit.id)
        changed = true
        continue
      }
      // Seirawan Hydra: "immediately heals from damage that doesn't kill it." Resolved HERE,
      // AFTER the lethal check above — so 6 damage all at once, or simultaneous batched blows that
      // together total its life (two Bosk Trolls defending), still kill it, while any damage that
      // leaves it alive (Arcane Barrage, one point at a time) is wiped. A Lethal-flagged blow has
      // already destroyed it via the lethal path in dealDamageToUnit before reaching here. Not a
      // `changed` cause — healing to 0 is terminal, so this never re-loops.
      if (unit.damage > 0 && !unit.silenced && getScript(unit.name)?.healsNonlethalDamage) {
        unit.damage = 0
        pushLog(state, unit.controller, `${unit.name} regrows its wounded heads.`)
      }
      // illegal region occupancy
      // An animated aura minion (Enchantress) lives on its enchantment, which is a
      // SURFACE aura: it DIES — to the cemetery, dragging its aura along (onAnyDeath),
      // rather than being banished like an ordinary oversized unit — if it ever leaves
      // the surface. That covers being pulled into a void (a square with no site) AND
      // being taken off the surface entirely (Burrowing underground, Submerged/flooded
      // underwater): the aura cannot exist there, so the creature perishes.
      if (unit.counters?.animatedAura) {
        // The minion IS its enchantment. It dies if the aura is gone (DISPELLED / banished —
        // the animation has nothing left to embody), or if it ever leaves the surface (pulled
        // into a void, burrowed underground, submerged/flooded underwater — the aura can't
        // exist there). onAnyDeath drops the aura; the shared card goes to the cemetery once.
        const auraGone = !state.auras[String(unit.counters.animatedAura)]
        if (auraGone || unit.region !== 'surface' || occupiedSquares(unit).some((s) => !siteAt(state, s.x, s.y))) {
          killUnit(state, unit.id)
          changed = true
        }
        continue
      }
      if (unit.size === '2x2') {
        // every part of an oversized unit needs a site under it. With Magellan Globe the footprint
        // may straddle an edge (parts wrap to the opposite edge — Mountain Giant FAQ 3).
        const wrap = edgesConnected(state)
        const anchorFits = (ax: number, ay: number) =>
          ([[0, 0], [1, 0], [0, 1], [1, 1]] as const).every(([dx, dy]) => {
            let x = ax + dx
            let y = ay + dy
            if (wrap) { x = ((x % GRID_W) + GRID_W) % GRID_W; y = ((y % GRID_H) + GRID_H) % GRID_H }
            return inBounds(x, y) && siteAt(state, x, y)
          })
        if (!anchorFits(unit.x, unit.y)) {
          // FAQ 4: it can no longer occupy the edge (e.g. Magellan Globe left play while it straddled)
          // — it can't balance, so it "falls to one side": relocate to the nearest fully in-bounds,
          // fully sited 2x2 (prefer the side it fell from — the clamped anchor). If NO legal position
          // exists anywhere in the realm, the minion dies. (Avatars shrinking is handled separately.)
          const cx = Math.min(Math.max(unit.x, 0), GRID_W - 2)
          const cy = Math.min(Math.max(unit.y, 0), GRID_H - 2)
          let placed: { x: number; y: number } | null = anchorFits(cx, cy) ? { x: cx, y: cy } : null
          for (let ay = 0; ay <= GRID_H - 2 && !placed; ay++)
            for (let ax = 0; ax <= GRID_W - 2 && !placed; ax++) if (anchorFits(ax, ay)) placed = { x: ax, y: ay }
          if (!placed) {
            banishUnit(state, unit.id)
          } else if (placed.x !== unit.x || placed.y !== unit.y) {
            unit.x = placed.x
            unit.y = placed.y
            pushLog(state, unit.controller, `${unit.name} can no longer straddle the edge and settles onto solid ground.`)
          }
          changed = true
        }
        continue
      }
      if (!canExistIn(state, unit, unit.region, unit.x, unit.y)) {
        if (unit.region === 'void') {
          banishUnit(state, unit.id)
        } else {
          // Spider power washing — a subsurface Root Spider that can't survive its now-flooded site
          if (unit.name === 'Root Spider' && (unit.region === 'underground' || unit.region === 'underwater'))
            awardAchievement(state, 'spider-power-washing', state.activePlayer)
          killUnit(state, unit.id)
        }
        changed = true
      }
    }
  }
  // Monuments that break from ABSORBED damage (Makeshift Barricade) settle at the OUTERMOST state check —
  // the true end of a simultaneous-damage event. Every prevented blow returned before its own
  // checkStateBased, so all the simultaneous absorptions have accrued onto the artifact by now; nested
  // (trigger-driven) checks run at sbDepth > 1 and must NOT settle/reset mid-event.
  if (sbDepth === 1) settleAbsorbBreak(state)
  } finally {
    sbDepth--
    // top-level settle done → survivors weren't killed by the just-resolved damage; wipe the
    // per-victim credit so a LATER, separate attack doesn't inherit these damagers as killers.
    if (sbDepth === 0 && state.flow) state.flow.damageCredit = {}
  }
}

/** Break any absorb-monument (Makeshift Barricade) whose damage tally reached its threshold this event,
 *  then clear every such tally so the next simultaneous event starts fresh. Called only at the outermost
 *  checkStateBased, when the whole event has resolved. */
function settleAbsorbBreak(state: GameState): void {
  for (const art of Object.values(state.artifacts)) {
    const threshold = getScript(art.name)?.breaksWhenAbsorbed
    if (threshold === undefined) continue
    const absorbed = art.counters?.absorbed ?? 0
    if (absorbed <= 0) continue
    if (absorbed >= threshold) {
      const owner = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
      if (art.carriedBy) {
        const carrier = state.units[art.carriedBy]
        if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
      }
      const card = state.cards[art.cardId]
      if (card) toCemetery(state, card.id)
      delete state.artifacts[art.id]
      pushLog(state, owner ?? null, `${art.name} splinters apart!`)
    } else if (art.counters) {
      delete art.counters.absorbed // it held — reset the tally for the next event
    }
  }
}

// ---- token summoning ----

export function summonToken(state: GameState, name: string, owner: PlayerId, x: number, y: number, region: Region = 'surface'): UnitState | null {
  if (summonBlockedAt(state, { x, y, region })) return null // No Man's Land etc. — the token can't be summoned here
  const def = getCard(name)
  const cardId = newId(state, 'c')
  state.cards[cardId] = { id: cardId, name, owner, isToken: true }
  const unitId = newId(state, 'u')
  const unit: UnitState = {
    id: unitId,
    cardId,
    name,
    owner,
    controller: owner,
    isAvatar: false,
    x,
    y,
    region,
    tapped: false,
    damage: 0,
    enteredTurn: state.turn,
    modifiers: [],
    carrying: [],
    carryingUnits: [],
    usedThisTurn: {},
  }
  state.units[unitId] = unit
  pushLog(state, owner, `A ${def.name} token appears.`)
  emitUnitEnters(state, unit)
  if (state.units[unitId]) applySummonTax(state, unit)
  checkStateBased(state)
  return state.units[unitId] ?? null
}

// ---- the EffectAPI context handed to card scripts ----

/** Synthesize a positioned pseudo-unit for a spellcaster ARTIFACT source (Omphalos & kin), so
 *  effects that read the caster's board position work when the "caster" is an artifact, not a unit.
 *  Kept in lockstep with casting.ts resolveCaster (which does the same for the cost/threshold pass). */
function artifactCasterUnit(state: GameState, sourceId: string, controller: PlayerId): UnitState | undefined {
  const art = state.artifacts[sourceId]
  if (!art || artifactSilenced(state, art) || !getKeywords(art.name).spellcaster) return undefined
  const ctrl = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
  return {
    id: art.id, cardId: art.cardId, name: art.name,
    owner: state.cards[art.cardId]?.owner ?? controller, controller: ctrl ?? controller,
    isAvatar: false, x: art.x, y: art.y, region: art.region ?? 'surface',
    tapped: false, damage: 0, enteredTurn: -1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
}

/** Synthesize a positioned pseudo-unit for a spellcaster SITE source (River of Flame, a Merlin's Tower-
 *  granted caster). A site occupies BOTH its surface and its subsurface, so `region` carries the chosen
 *  casting region (see casting.ts' region prompt); it defaults to the surface. Without this, a spell that
 *  reads `ctx.caster` (a projectile, or a positional blast like Minor Explosion) crashed on a site caster. */
function siteCasterUnit(state: GameState, sourceId: string, controller: PlayerId, region?: Region): UnitState | undefined {
  const site = state.sites[sourceId]
  if (!site) return undefined
  return {
    id: site.id, cardId: site.cardId, name: site.name,
    owner: state.cards[site.cardId]?.owner ?? controller, controller: site.controller ?? controller,
    isAvatar: false, x: site.x, y: site.y, region: region ?? 'surface',
    tapped: false, damage: 0, enteredTurn: -1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
}

export function makeCtx(
  state: GameState,
  sourceId: string,
  controller: PlayerId,
  targets: TargetRef[],
  at?: { x: number; y: number; region?: Region },
  extra?: any,
  meta?: { kind: DamageSource['kind']; name?: string; elements?: string[] },
): EffectAPI {
  // A spellcaster ARTIFACT (Dank Omphalos & other Omphaloi, Vivien-as-artifact) casts as a
  // pseudo-unit positioned at the artifact — so a spell that fires from `ctx.caster` (Magic
  // Missiles, Ball Lightning, any projectile) has a real origin instead of crashing on undefined.
  // Mirrors resolveCaster's synthesis; only kicks in when the source isn't a real unit.
  let caster = state.units[sourceId] ?? artifactCasterUnit(state, sourceId, controller) ?? siteCasterUnit(state, sourceId, controller, extra?.castRegion)
  // an OVERSIZED / Rack-stretched caster occupies several squares; when it fires a projectile or a
  // distance-measured blast it picks WHICH square to act from (see casting.ts' origin prompt). Use a
  // repositioned copy so positional reads (ctx.caster.x/y, step distance) measure from that square.
  if (caster && extra?.castOrigin) caster = { ...caster, x: extra.castOrigin.x, y: extra.castOrigin.y }
  // A CARRIED artifact's ability acts through its BEARER: that unit is the one dealing the damage, so it
  // inherits the bearer's Lethal (a Poisonous Dagger makes Ring of Morrigan's bleed lethal) and takes the
  // kill credit. Ground/uncarried artifacts (and non-artifact sources) have no bearer actor.
  const actorUnit = state.units[sourceId] ?? ((): UnitState | undefined => {
    const a = state.artifacts[sourceId]
    return a?.carriedBy ? state.units[a.carriedBy] : undefined
  })()
  const sourceName =
    meta?.name ?? state.units[sourceId]?.name ?? state.sites[sourceId]?.name ?? state.artifacts[sourceId]?.name ?? state.auras[sourceId]?.name
  const damageSource: DamageSource = {
    player: controller,
    kind: meta?.kind ?? 'effect',
    name: sourceName,
    // a UNIT's ability/effect that deals damage gets kill credit (priority 1); a spell's
    // damage does NOT credit the caster-as-damager here (magic is priority 2, via actionCredit).
    sourceUnitId: meta?.kind !== 'magic' ? actorUnit?.id : undefined,
    elements: meta?.elements,
  }
  return {
    state,
    sourceId,
    controller,
    caster,
    targets,
    at,
    extra,
    log: (msg) => pushLog(state, controller, msg),
    // add mana to the controller and float a "+n 🔮" over THIS source (Field Laborers & friends)
    gainMana: (amount: number) => {
      state.players[controller].mana += amount
      const at = sourceSquare(state, sourceId)
      if (at) recordManaGain(state, at.x, at.y, at.region, amount)
    },
    dealDamage: (target, n) => {
      if ('unit' in target) {
        const u = state.units[target.unit]
        if (u) {
          // Lethal keyword: damage a UNIT deals via its own ability (Sparkmage's
          // spark…) is lethal — e.g. a carried Poisonous Dagger. Spells the bearer
          // casts (kind 'magic') are excluded: the spell deals the damage, not the unit.
          const src = actorUnit
          const lethal = !!src && damageSource.kind !== 'magic' && !u.isAvatar && effKeywords(state, src).lethal
          dealDamageToUnit(state, u, n, controller, { lethal, source: damageSource })
        }
      } else {
        dealDamage(state, target, n, controller)
      }
    },
    // Force the pending state-based death checks now, mid-effect. Damage during an effect is otherwise
    // simultaneous (deaths settle only when the whole effect ends), so a script that must OBSERVE a
    // kill it just dealt — before doing something conditional on it — calls this to collapse the wave
    // early. Only for genuine "did this die?" follow-ups (Fire Harpoons' pull-if-it-survived, a
    // kill-counter); ordinary area damage must NOT call it, or it forfeits the simultaneity.
    settleDeaths: () => checkStateBased(state),
    strike: (attacker, target) => {
      // A strike is a real action — not just its damage (rulebook). So an effect
      // strike (Hotwheel's roll, Wraetannis Titan's genesis, …) fires the SAME
      // consequences a melee blow does: "whenever this strikes", the enemy-Avatar
      // trigger (Interrogator), "when struck", and kill triggers (Stygian Archers).
      const kw = effKeywords(state, attacker)
      const power = effAttack(state, attacker)
      if (!('unit' in target)) {
        // striking a site: no unit hooks, just the damage
        dealDamage(state, target, power, controller)
        return
      }
      const tu = state.units[target.unit]
      if (!tu) return
      // "whenever this unit strikes" — fires even at 0 power (a strike still happened)
      const strikeHook = !attacker.silenced ? getScript(attacker.name)?.onStrike : undefined
      if (strikeHook) strikeHook(makeCtx(state, attacker.id, controller, []), tu)
      // carried artifacts watching their bearer's blows (The Rack) — an EFFECT strike (Grapple Shot
      // arrival, Hotwheel's roll…) is a real strike, so these fire here exactly as on a combat blow.
      for (const artId of attacker.carrying) {
        const bart = state.artifacts[artId]
        const bhook = bart ? getScript(bart.name)?.bearerOnStrike : undefined
        if (bart && bhook) bhook(makeCtx(state, bart.id, controller, []), bart.id, tu)
      }
      const snapshot = { ...tu } // pre-death snapshot for kill hooks (position intact)
      const wasAvatar = tu.isAvatar
      if (power > 0 && state.units[tu.id]) {
        const lethalVs = !attacker.silenced ? getScript(attacker.name)?.lethalVs : undefined
        dealDamageToUnit(state, tu, power, controller, {
          lethal: (kw.lethal || !!lethalVs?.(state, attacker, tu)) && !tu.isAvatar,
          source: { player: controller, kind: 'strike', attackerId: attacker.id, name: attacker.name },
        })
      }
      // "whenever an ally strikes an enemy Avatar" (Interrogator) — a strike, damage or not
      if (wasAvatar) emitEvent(state, 'onAllyStrikesAvatar', attacker, snapshot)
      checkStateBased(state)
      const survivor = state.units[snapshot.id]
      if (survivor) {
        const s = getScript(survivor.name)
        if (s?.onSelfStruck && !survivor.silenced) s.onSelfStruck(makeCtx(state, survivor.id, survivor.controller, []), attacker)
      } else if (!wasAvatar) {
        // the strike killed the target → kill triggers (Stygian Archers, Sir Pellinore).
        // everKilled bookkeeping only applies while the striker is still alive.
        if (state.units[attacker.id]) attacker.counters = { ...attacker.counters, everKilled: 1 }
        const killHook = !attacker.silenced ? getScript(attacker.name)?.onKill : undefined
        if (killHook) killHook(makeCtx(state, attacker.id, controller, []), snapshot as UnitState)
        emitEvent(state, 'onUnitKilled', snapshot, attacker)
      }
      checkStateBased(state)
    },
    kill: (unitId) => {
      const u = state.units[unitId]
      // destruction effects break wards instead (Detonate FAQ)
      if (u && checkWard(state, u, controller, u.controller, 'destroy')) {
        pushLog(state, controller, `${u.name}'s ward breaks.`)
        return
      }
      killUnit(state, unitId)
    },
    banish: (unitId) => banishUnit(state, unitId),
    bounce: (unitId) => bounceUnit(state, unitId),
    heal: (unitId, n) => healUnit(state, unitId, n),
    gainLife: (p, n) => gainLife(state, p, n),
    loseLife: (p, n) => loseLife(state, p, n),
    draw: (p, deck, n) => drawCards(state, p, deck, n ?? 1),
    // "draw a card"/"draw N cards": player chooses spellbook-or-atlas per card (see askDrawCard)
    drawCard: (p, n) => askDrawCard(state, p, n ?? 1),
    // Pay a mana COST from a script (ability/site effect). ALWAYS use this — never `p.mana -= n`
    // directly — so the mana is recorded as spent-this-turn (flow.manaSpent). Otherwise the client
    // mana widget's total (= remaining + spent) appears to shrink each use. (Not for draining an
    // opponent's mana — that's a genuine loss of their total, so it must NOT bump manaSpent.)
    spendMana: (p, n) => { state.players[p].mana -= n; bumpManaSpent(state, p, n) },
    addPower: (unitId, amount, duration) => {
      const u = state.units[unitId]
      if (u && ((getScript(u.name)?.unmodifiable && !u.silenced) || carriedUnmodifiable(state, u))) {
        pushLog(state, u.controller, `${u.name} cannot be modified.`)
        return
      }
      if (u) u.modifiers.push({ kind: 'power', amount, duration, turn: state.turn, sourcePlayer: controller })
      checkStateBased(state)
    },
    grantKeyword: (unitId, keyword, duration) => {
      const u = state.units[unitId]
      if (u && ((getScript(u.name)?.unmodifiable && !u.silenced && keyword !== 'ward') || carriedUnmodifiable(state, u))) {
        pushLog(state, u.controller, `${u.name} cannot be modified.`)
        return
      }
      if (u) u.modifiers.push({ kind: 'keyword', keyword, duration, turn: state.turn, sourcePlayer: controller })
    },
    summonToken: (name, owner, x, y, region) => summonToken(state, name, owner, x, y, region),
    teleport: (unitId, x, y, region, opts) => {
      const u = state.units[unitId]
      if (!u) return
      const push = !!opts?.push
      // Cage of Sidrak (golden rule): a locked minion can only leave via TELEPORTATION-based forced
      // movement. A push/pull/drag (River Rapids, Riptide, Scatter…) can't take it out; a genuine
      // Teleport (Blink, Swap) frees it — so we drop the cage link before it moves.
      const caged = (state.flow?.cagedUnits ?? []).find((c: { unitId: string }) => c.unitId === unitId)
      if (caged) {
        if (push) {
          pushLog(state, u.controller, `${u.name} is locked in the Cage of Sidrak — force alone can't free it.`)
          return
        }
        state.flow!.cagedUnits = (state.flow!.cagedUnits as { unitId: string }[]).filter((c) => c.unitId !== unitId)
        if (u.counters) delete u.counters.caged
      }
      // forced-move protection: enemy effects can't relocate protected units
      if (u.controller !== controller && moveProtected(state, u)) {
        pushLog(state, u.controller, `${u.name} holds its ground — it can't be moved by force.`)
        return
      }
      // Sphere of Animosity: a trapped avatar "can't ... be moved by force" out of the trap. Any
      // forced relocation (pull, push, blink, swap, drag) to a square outside the trap is refused;
      // a move to another trap-occupied square is allowed. (Cage of Sidrak's teleport exception was
      // handled above; the Sphere grants no such exception.)
      if (avatarTrapBlocksMove(state, u, x, y)) {
        pushLog(state, u.controller, `${u.name} is held fast by the Sphere of Animosity — force can't drag it out.`)
        return
      }
      // "Avatars can never enter void locations" (Keyword: Void). No forced movement — Mudslide,
      // Windblast, a pull/push/drag or a teleport/swap — may drop an Avatar onto a siteless (void)
      // square. Other units may be shoved into the void (Mudslide spans it); only Avatars can't.
      // (An Avatar can still END UP in the void passively when a site moves out from under it —
      // that path doesn't go through here and doesn't count as "entering".)
      if (u.isAvatar && !siteAt(state, x, y)) {
        pushLog(state, u.controller, `${u.name} can't be forced into the void.`)
        return
      }
      // A PUSH/pull's forced "one step" must land on a real adjacent LOCATION — you can't shove ANY
      // unit into the void (Windblast/Scatter FAQ: a siteless square is the void, not a location). A
      // genuine Teleport/relocation (push: false — Blink, Swap, or a card that places into the void)
      // MAY reach a siteless square; the unit is then banished below if it lacks Voidwalk.
      // EXCEPTION — `intoVoid`: cards whose text deliberately drags/pushes INTO the void (Lacuna Entity
      // "drag to here [in the void]", Nightmare "push it to an adjacent location OR void") keep full
      // push semantics (Cage-lock, push-bans, moveProtected) but ARE allowed to reach a siteless square.
      if (push && !opts?.intoVoid && !siteAt(state, x, y)) {
        pushLog(state, u.controller, `${u.name} can't be pushed into the void.`)
        return
      }
      // site entry restrictions (Gnome Hollows' power cap, Great Wall…) apply to forced relocation
      // too: a unit that "can't enter" a site can't be teleported / Blinked / Teleported into it.
      // A PUSH additionally trips push-only border bans (Perilous Bridge); a Teleport does not.
      const from = { x: u.x, y: u.y, region: u.region }
      const destRegion = region ?? u.region
      const dx = x - from.x, dy = y - from.y
      // A push/pull/drag is FORCED MOVEMENT but it still TAKES STEPS — only a genuine Teleport "moves a
      // unit directly to a specified location without taking any steps in between" (rulebook). So a
      // multi-square drag along a straight line (Grapple Shot, Meat Hook, harpoons, a current…) must pass
      // THROUGH every square between origin and destination, entering each "even if just for a moment"
      // (rulebook), so every square's enter/leave trigger fires — Briar Patch thorns, flipped-Druid
      // thorns, Dark Alley stealth, a Giant Shark's waters, Root Spider… — instead of teleport-jumping
      // past them. We only walk when the move is a straight orthogonal line staying in one region (the
      // real push/pull geometry); a genuine teleport, a region-crossing drag, or a 1-step shove relocates
      // directly below. Oversized / multi-square bodies also fall through to the direct relocation.
      const walk =
        push && destRegion === u.region && (dx === 0) !== (dy === 0) &&
        Math.abs(dx) + Math.abs(dy) > 1 && u.size !== '2x2' && !(u.extraSquares?.length)
      if (walk) {
        const sx = Math.sign(dx), sy = Math.sign(dy)
        const steps = Math.abs(dx) + Math.abs(dy)
        // can the unit be forced from `a` into the adjacent `b`? A void gap (a siteless square) can't be
        // crossed by a push (rulebook: a unit "can't be pushed into the void"), and forced/ push-only
        // entry bans still stop it (Gnome Hollows via entryFilterBlocksForcedEntry, Bailey / Perilous
        // Bridge via entryFilterBlocksPush). Movement LIMITATIONS of the unit itself (Immobile, walls,
        // Burrowing/Submerge/Voidwalk) are NOT consulted — forced movement ignores them.
        const canEnter = (a: { x: number; y: number; region: Region }, b: { x: number; y: number; region: Region }) =>
          !!siteAt(state, b.x, b.y) && siteEntryAllowed(state, u, a, b, true, push)
        state.flow = state.flow ?? {}
        // while it is being dragged the unit is NOT "at rest", so an at-rest disabler (Hillock Basilisk /
        // Stone-Gaze Gorgons) can't freeze it in a square it is merely passing through. It settles — and
        // becomes disable-able again — only once it stops (finally, below).
        state.flow.entering = [...((state.flow.entering as string[] | undefined) ?? []), u.id]
        try {
          for (let i = 1; i <= steps; i++) {
            const stepFrom = { x: u.x, y: u.y, region: u.region }
            const next = { x: u.x + sx, y: u.y + sy, region: u.region }
            if (!canEnter(stepFrom, next)) break // blocked — it comes to rest on the last square it entered
            u.x = next.x; u.y = next.y
            // final=true on the square it actually STOPS on (the destination, or where a ban halts it) so
            // "stops here" triggers (Vaults of Zul, Flame of the First Ones) fire once, at rest — while
            // pass-through squares emit final=false and only fire "enters/leaves" triggers.
            const after = { x: u.x + sx, y: u.y + sy, region: u.region }
            const isFinal = i === steps || !canEnter({ x: u.x, y: u.y, region: u.region }, after)
            emitUnitMoved(state, u, stepFrom, 'forced', isFinal)
            if (!state.units[u.id]) return // a trigger (Briar Patch thorns…) killed the mover mid-drag
            syncCarried(state, u)
            if (u.carriedBy) {
              const carrier = state.units[u.carriedBy]
              if (!carrier || carrier.x !== u.x || carrier.y !== u.y || carrier.region !== u.region) detachFromCarrier(state, u)
            }
            checkStateBased(state)
            if (!state.units[u.id]) return
            if (isFinal) break
          }
        } finally {
          settleEntering(state, u.id) // it has come to rest — an at-rest disabler now bites it here
        }
        checkStateBased(state)
        return
      }
      const dest = { x, y, region: destRegion }
      if (!siteEntryAllowed(state, u, from, dest, true, push)) {
        pushLog(state, u.controller, `${u.name} can't enter there.`)
        return
      }
      u.x = x
      u.y = y
      if (region) u.region = region
      // A square with no site IS the void (rulebook: "A square without a site is part of the void
      // region"). A non-avatar RELOCATED onto one enters the void region; checkStateBased then
      // banishes it unless it has Voidwalk. Only on an actual move (a same-square no-op pull, e.g.
      // Pudge hooking a co-located enemy, must not void a unit that never left). Avatars are guarded.
      const moved = from.x !== u.x || from.y !== u.y
      if (moved && !u.isAvatar && !siteAt(state, u.x, u.y)) u.region = 'void'
      emitUnitMoved(state, u, from)
      // its cargo travels along; if IT was the cargo, the ride is over
      syncCarried(state, u)
      if (u.carriedBy) {
        const carrier = state.units[u.carriedBy]
        if (!carrier || carrier.x !== u.x || carrier.y !== u.y || carrier.region !== u.region) {
          detachFromCarrier(state, u)
        }
      }
      // a genuine teleport (not a push/pull shove) zaps away + glows the destination on the client
      if (moved && !push) recordTeleport(state, u.id, u.name, from, { x: u.x, y: u.y })
      checkStateBased(state)
    },
    tap: (unitId) => {
      const u = state.units[unitId]
      if (u) u.tapped = true
    },
    untap: (unitId) => {
      const u = state.units[unitId]
      if (u) u.tapped = false
    },
    destroySite: (siteId, by, sacrifice) => destroySite(state, siteId, by ?? controller, sacrifice),
    disable: (unitId) => {
      const u = state.units[unitId]
      if (u && !u.isAvatar) u.disabled = true
    },
    floodSite: (siteId, duration) => {
      const site = state.sites[siteId]
      if (!site || site.isRubble) return
      if (!applyFlood(state, site, controller)) return
      if (duration === 'endOfTurn') {
        state.flow = state.flow ?? {}
        state.flow.unfloodAtEnd = [...(state.flow.unfloodAtEnd ?? []), siteId]
      }
      pushLog(state, controller, `${site.name} floods.`)
      notifySiteInterference(state, 'modify', site, controller)
      checkStateBased(state)
    },
    breakArtifact: (artifactId) => {
      const art = state.artifacts[artifactId]
      if (!art) return
      // artifact Deathrites fire when it breaks (e.g. Clay Golem)
      const script = getScript(art.name)
      const artController = art.carriedBy ? state.units[art.carriedBy]?.controller ?? art.conjuredBy : art.conjuredBy
      if (script?.deathrite) script.deathrite(makeCtx(state, art.id, artController, []))
      if (!state.artifacts[artifactId]) return
      if (art.carriedBy) {
        const carrier = state.units[art.carriedBy]
        if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== artifactId)
      }
      toCemetery(state, art.cardId)
      delete state.artifacts[artifactId]
      pushLog(state, controller, `${art.name} breaks.`)
    },
    discardRandom: (player, opts) => {
      const p = state.players[player]
      // filter the candidate pool BEFORE the lucky/random determination so the
      // Lucky Charm / Kythera chooser only ever sees eligible cards. Caster-locked
      // cards (Morgana/Omphalos) are never part of the discardable hand.
      const pool = discardableHandIds(state, player, !!opts?.spellsOnly)
      if (pool.length === 0) return
      const r = luckyCandidates(state, player, pool.map((id) => ({ label: state.cards[id].name, payload: id })))
      if (!r.choose) {
        if (typeof r.payload === 'string') discardCardId(state, player, r.payload)
        return
      }
      pushPrompt(state, {
        player: r.chooser,
        kind: 'chooseCards',
        title: r.chooser === player ? 'Lucky Charm: choose which card is discarded' : `Fate bends: determine the "random" card ${p.name} discards`,
        data: { cards: r.options.map((o) => o.label), pick: 1, upTo: false },
        cont: 'random:discardChosen',
        ctx: { player, __opts: r.options.map((o) => o.payload), __labels: r.options.map((o) => o.label) },
      })
    },
    discardChoose: (player, opts) => {
      // prompted discard (id-based). Candidate ids are captured at ask time and
      // resolved by id in `effect:discardChosen`, never by live hand index. Caster-locked
      // cards (Morgana/Omphalos) are excluded — they are not part of the discardable hand.
      let ids = discardableHandIds(state, player, !!opts?.spellsOnly)
      if (opts?.filter) ids = ids.filter((id) => opts.filter!(state.cards[id].name))
      const count = Math.min(opts?.pick ?? 1, ids.length)
      if (count === 0) return
      pushPrompt(state, {
        player,
        kind: 'chooseCards',
        title: opts?.title ?? (opts?.spellsOnly ? 'Discard which spell?' : 'Discard which card?'),
        data: { cards: ids.map((id) => state.cards[id].name), pick: count, upTo: opts?.upTo ?? false },
        cont: 'effect:discardChosen',
        ctx: { player, __ids: ids },
      })
    },
    mill: (player, deck, n) => {
      const p = state.players[player]
      for (let i = 0; i < n; i++) {
        const id = p[deck].shift()
        if (id === undefined) break
        toCemetery(state, id) // honor Mismanaged Mortuary / Kor Crematory
      }
      pushLog(state, player, `${p.name} mills ${n} from their ${deck}.`)
    },
    ask: (prompt, contKey, ctx) => {
      const source = state.units[sourceId] ?? state.artifacts[sourceId] ?? state.sites[sourceId] ?? state.auras[sourceId]
      // magic spells route their continuations to the MAGIC's script, not the
      // caster's (meta.name carries the spell name through cont chains). For a card
      // acting from a zone (hand/cemetery response spells — Valor, Dodge Roll), the
      // source isn't in play, so fall back to the card's own name by its id.
      const cardName = meta?.name ?? source?.name ?? state.cards[sourceId]?.name ?? ''
      let data = prompt.data ?? {}
      // GENERALIZED direction-picker preview: ANY cardinal-direction chooseOption prompt (Snowball,
      // Lava Flow, Cone of Flame, Rampage, Rolling Boulder…) automatically gets each direction's
      // reachable lane (`dirs`) + origin (`from`) + source element (`element`) so the client can draw
      // the conveyor arrows — no per-card wiring. Origin prefers the effect's stated from/origin
      // (Day of Judgment, Bone Spear) and falls back to the acting source's square. A card that
      // pre-sets `dirs` keeps its own.
      if (prompt.kind === 'chooseOption' && !data.dirs && Array.isArray(data.options) && data.options.length > 0 && data.options.every((o: any) => o === 'n' || o === 's' || o === 'e' || o === 'w')) {
        const origin = (ctx?.from ?? ctx?.origin ?? (source ? { x: source.x, y: source.y } : null)) as { x: number; y: number } | null
        if (origin && typeof origin.x === 'number') {
          const element = meta?.elements ?? (cardName ? getCard(cardName)?.elements : undefined)
          data = { ...data, from: origin, dirs: directionReach(state, origin.x, origin.y), element }
        }
      }
      pushPrompt(state, {
        player: prompt.player ?? controller,
        kind: prompt.kind,
        title: prompt.title,
        data,
        cont: `script:${cardName}:${contKey}`,
        ctx: { sourceId, controller, targets, at, extra, __meta: meta, ...ctx },
      })
    },
    lucky: (options, contKey, display = 'options', ctxExtra = {}) => {
      const r = luckyCandidates(state, controller, options)
      if (!r.choose) return r.payload
      const source = state.units[sourceId] ?? state.artifacts[sourceId] ?? state.sites[sourceId] ?? state.auras[sourceId]
      const cardName = meta?.name ?? source?.name ?? ''
      pushPrompt(state, {
        player: r.chooser,
        kind: display === 'cards' ? 'chooseCards' : 'chooseOption',
        title: r.chooser === controller ? 'Lucky Charm: choose an outcome' : 'Determine the outcome',
        data: display === 'cards' ? { cards: r.options.map((o) => o.label), pick: 1, upTo: false } : { options: r.options.map((o) => o.label) },
        cont: `script:${cardName}:${contKey}`,
        ctx: { sourceId, controller, targets, at, extra, __meta: meta, ...ctxExtra, __opts: r.options.map((o) => o.payload), __labels: r.options.map((o) => o.label) },
      })
      return undefined
    },
  }
}

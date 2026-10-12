// ─────────────────────────────────────────────────────────────────────────────
// LEGAL-MOVE GENERATOR  —  the bot's "at any moment, what can I legally do?"
//
// `expandActions(state, player)` returns EVERY action the engine will accept from
// the current position, paired with the resulting state. Correctness is guaranteed
// by construction: every candidate is trial-applied on a clone and kept only if the
// engine returns ok. So the list can never contain an illegal move — and, because
// casts / abilities open prompts, those prompts are themselves decision points that
// the NEXT expandActions call enumerates, the search explores targets/squares/defends
// as real engine branches rather than guessing them.
//
// This is the foundation of the search bot (bot_search.ts). It is intentionally the
// single source of truth for "what moves exist" — no ad-hoc candidate lists elsewhere.
// ─────────────────────────────────────────────────────────────────────────────
import type { Action, GameState, PlayerId, Region, UnitState } from '../engine/types'
import { applyAction, canActivate, actingSeatFor } from '../engine/game'
import { reachableWithPaths } from '../engine/movement'
import { canCast, legalSiteSquares, validateSummonAt, validateTarget } from '../engine/casting'
import { grantedAbilities, effAttack, effDefence } from '../engine/statics'
import { orthAdjacentWrapped, siteAt, GRID_W, GRID_H } from '../engine/grid'
import { getCard } from '../cards/db'
import { getScript } from '../cards/scripts/registry'

/** Fast state clone for hypothetical moves. GameState is pure JSON (no Map/Set/Date/functions — scripts
 *  are looked up by name, never stored), so a hand-rolled structural clone is ~3.25x faster than a
 *  JSON round-trip (and ~3.5x faster than structuredClone) while producing byte-identical data. This is
 *  the single hottest operation in the search — the whole tree's throughput scales with it. */
function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) {
    const n = new Array(v.length)
    for (let i = 0; i < v.length; i++) n[i] = deepClone(v[i])
    return n as unknown as T
  }
  const o: Record<string, unknown> = {}
  for (const k in v) o[k] = deepClone((v as Record<string, unknown>)[k])
  return o as T
}
export const cloneState = (s: GameState): GameState => deepClone(s)
const REGIONS: Region[] = ['surface', 'underground', 'underwater']

export interface Expansion {
  action: Action
  next: GameState
}

/** apply `a` on a clone; return the resulting state iff the engine accepts it, else null. */
function tryAction(state: GameState, player: PlayerId, a: Action): GameState | null {
  const next = cloneState(state)
  try {
    if (applyAction(next, player, a).ok) return next
  } catch {
    /* an action that throws is not legal */
  }
  return null
}

/** the candidate CHOICE payloads for an open prompt — explicit for the common kinds, plus a generic
 *  data-driven fallback. The trial-apply filter in expandActions keeps only the ones the engine
 *  actually accepts, so over-generating here is safe (it can miss options, never invent illegal ones). */
function promptChoices(prompt: any, state: GameState): any[] {
  const d = prompt.data ?? {}
  const out: any[] = []
  const seen = new Set<string>()
  const add = (c: any) => { const k = JSON.stringify(c); if (!seen.has(k)) { seen.add(k); out.push(c) } }

  switch (prompt.kind) {
    case 'allocateDamage': {
      // Splitting a striker's damage among several defenders has a huge partition space — enumerating it
      // blows up the search (and the OLD default case produced only junk answers like [] / null, none of
      // which the engine accepts, so it just re-pushed the same prompt → the bot froze). Instead emit a
      // FEW valid, fully-spent allocations. Rule: never pour more into a single minion than kills it (cap
      // each target at its remaining life); if the striker can kill EVERY defender, that's not a real
      // choice — emit ONE canonical "kill all" split. Any damage still unspent after every target is
      // lethal is dumped onto one card (the avatar if present) so the total is always a legal answer.
      const strikerId: string | undefined = d.strikerId
      const power: number = Math.max(0, d.power ?? 0)
      const cands: string[] = (d.candidates ?? []).filter((id: string) => state.units[id])
      if (!strikerId || !cands.length) { add({ strikerId, allocation: {} }); break }
      const need = (id: string) => Math.max(1, effDefence(state, state.units[id]) - state.units[id].damage)
      const totalNeed = cands.reduce((s, id) => s + need(id), 0)
      // walk `order`, giving each target exactly enough to kill it until `power` runs out; dump any
      // remainder on the avatar (else the first candidate) — the sanctioned overflow to stay legal.
      const spread = (order: string[]): Record<string, number> => {
        const alloc: Record<string, number> = {}
        let left = power
        for (const id of order) {
          if (left <= 0) break
          const give = Math.min(need(id), left)
          if (give > 0) { alloc[id] = give; left -= give }
        }
        if (left > 0) {
          const dump = cands.find((id) => state.units[id].isAvatar) ?? order[0] ?? cands[0]
          alloc[dump] = (alloc[dump] ?? 0) + left
        }
        return alloc
      }
      // cheapest-to-kill first → secures the most kills for the damage available
      const cheapest = [...cands].sort((a, b) => need(a) - need(b))
      add({ strikerId, allocation: spread(cheapest) })
      // when it CAN'T kill everyone, the split is a genuine tactical choice — also offer all-in on the
      // avatar (race the face). When it CAN kill everyone, the cheapest spread already kills all, so we
      // stop there (one option → no branching).
      if (power < totalNeed) {
        const avatar = cands.find((id) => state.units[id].isAvatar)
        if (avatar) add({ strikerId, allocation: spread([avatar]) })
      }
      break
    }
    case 'yesNo':
    case 'stayInFight':
      add(true); add(false); break
    case 'chooseOption':
      for (const o of d.options ?? []) add(o)
      break
    case 'chooseSquare':
      for (const sq of d.squares ?? []) add({ x: sq.x, y: sq.y })
      break
    case 'nameCard':
      for (const n of d.names ?? []) add(n)
      break
    case 'firstSite':
    case 'drawDeck':
      for (const id of d.ids ?? []) add(id) // choose one card id (e.g. which site to establish)
      break
    case 'chooseCards': {
      const pick = d.pick ?? 1
      const n = (d.cards ?? []).length
      if (d.upTo !== false) add([])
      for (let i = 0; i < n; i++) add([i]) // singletons
      if (pick > 1 && n) add(Array.from({ length: Math.min(pick, n) }, (_, i) => i)) // the full pick
      break
    }
    case 'chooseTargets':
    case 'defend': {
      const cands: string[] = d.candidates ?? []
      const count = d.count ?? 1
      if (d.upTo !== false || prompt.kind === 'defend') add([])
      for (const id of cands) add([id]) // each single target
      if (count > 1 && cands.length) add(cands.slice(0, count)) // a full pick
      break
    }
    default:
      // generic: whatever the prompt data offers, plus the usual scalar answers
      for (const o of d.options ?? []) add(o)
      for (const n of d.names ?? []) add(n)
      for (const id of d.ids ?? []) add(id)
      for (const sq of d.squares ?? []) add({ x: sq.x, y: sq.y })
      for (const id of d.candidates ?? []) add([id])
      add(true); add(false); add([]); add(null)
      break
  }
  return out
}

/** squares where `player` might legally place a Minion/Artifact/Aura: on or beside their controlled
 *  sites (covers "atop your sites" + nearby-summon grants). Over-generated; trial-apply confirms. */
function placementSquares(state: GameState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const seen = new Set<string>()
  const add = (x: number, y: number) => { const k = `${x},${y}`; if (!seen.has(k)) { seen.add(k); out.push({ x, y }) } }
  for (const s of Object.values(state.sites)) {
    if (s.isRubble) continue
    add(s.x, s.y)
    for (const n of orthAdjacentWrapped(state, s.x, s.y)) add(n.x, n.y)
  }
  return out
}

/** Every valid target-id COMBINATION for a spell's target specs. A targeted spell (Grapple Shot, Bolt…)
 *  needs its targets IN the cast action — casting it target-less fails "Missing targets.", so without
 *  this the search never generates any targeted spell at all. Candidates are over-generated per `what`
 *  and filtered by the engine's own `validateTarget` (the arbiter — honours owner/range/ward/filter);
 *  combos are capped so a multi-target spell can't blow up the branching. */
function castTargetCombos(state: GameState, me: PlayerId, specs: { what?: string; count?: number; upTo?: boolean }[], caster: UnitState): string[][] {
  const CAP = 48
  const candsFor = (spec: { what?: string }): string[] => {
    const w = spec.what
    let raw: { id: string; ref: unknown }[]
    if (w === 'site') raw = Object.values(state.sites).filter((s) => !s.isRubble).map((s) => ({ id: s.id, ref: { site: s.id } }))
    else if (w === 'artifact') raw = Object.values(state.artifacts).map((a) => ({ id: a.id, ref: { artifact: a.id } }))
    else if (w === 'minionOrArtifact') raw = [
      ...Object.values(state.units).filter((u) => !u.carriedBy).map((u) => ({ id: u.id, ref: { unit: u.id } })),
      ...Object.values(state.artifacts).map((a) => ({ id: a.id, ref: { artifact: a.id } })),
    ]
    else if (w === 'square') {
      raw = []
      for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) for (const region of REGIONS) raw.push({ id: `sq:${x},${y},${region}`, ref: { square: { x, y, region } } })
    } else raw = Object.values(state.units).filter((u) => !u.carriedBy).map((u) => ({ id: u.id, ref: { unit: u.id } })) // unit / minion / avatar
    const out: string[] = []
    for (const c of raw) { try { if (validateTarget(state, spec as never, c.ref as never, caster, me) === null) out.push(c.id) } catch { /* not a legal target */ } }
    return out
  }
  let combos: string[][] = [[]]
  for (const spec of specs) {
    const ids = candsFor(spec)
    const n = spec.count ?? 1
    const picks: string[][] = []
    if (spec.upTo) picks.push([]) // may take none of this spec
    if (n <= 1) { for (const id of ids) picks.push([id]) }
    else { // combinations of size n, capped
      const pick = (start: number, acc: string[]): void => {
        if (picks.length >= CAP) return
        if (acc.length === n) { picks.push([...acc]); return }
        for (let i = start; i < ids.length; i++) pick(i + 1, [...acc, ids[i]])
      }
      pick(0, [])
    }
    const next: string[][] = []
    for (const base of combos) { for (const p of picks) { next.push([...base, ...p]); if (next.length >= CAP) break } if (next.length >= CAP) break }
    combos = next.length ? next : [[]]
  }
  return combos
}

/**
 * Every legal action for `player` right now, with the resulting state.
 * Handles the three decision contexts: an open prompt, the mulligan, and the main phase.
 */
export function expandActions(state: GameState, player: PlayerId, opts?: { deadline?: number; boardOnly?: boolean; noSpellCasts?: boolean }): Expansion[] {
  const out: Expansion[] = []
  const push = (a: Action) => { const next = tryAction(state, player, a); if (next) out.push({ action: a, next }) }
  // anytime generation: with a deadline set, stop between phases once time is up and return what we
  // have (endTurn is emitted FIRST so it's always an option). Each candidate still applies fully, so
  // a single heavy apply can overshoot slightly — but a full board no longer runs for many seconds.
  const timeUp = () => opts?.deadline !== undefined && Date.now() > opts.deadline

  if (state.winner !== null || state.phase === 'over') return out

  // ── an open prompt this player must answer ──
  const prompt = state.prompts[0]
  if (prompt && actingSeatFor(state, prompt.player) === player) {
    for (const choice of promptChoices(prompt, state)) push({ t: 'prompt', promptId: prompt.id, choice })
    return out
  }

  // ── mulligan ──
  if (state.phase === 'mulligan') {
    push({ t: 'keepHand' })
    const hand = state.players[player].hand
    for (const id of hand) push({ t: 'mulligan', back: [id] }) // singles; the search can chain more
    push({ t: 'mulligan', back: [] })
    return out
  }

  // ── not our main phase → nothing to do (opponent's turn / wrong phase) ──
  if (state.phase !== 'main' || actingSeatFor(state, state.activePlayer) !== player) return out

  const me = player
  const avatarId = state.players[me].avatarUnitId
  const myUnits = Object.values(state.units).filter((u) => u.controller === me && !u.carriedBy && !u.tapped)
  push({ t: 'endTurn' }) // always available, even if the phases below are cut short by the deadline

  // A developing avatar's ONE Tap each turn belongs on site development — a non-site Tap ability
  // (Sorcerer's "Draw a spell", …) can be really strong but taps the avatar so it can't play/draw a
  // site. Below 4 sites we BAN it outright for the bot (it should never even consider it); the eval
  // penalises the 4+ range on a gradient (see eval.ts avatarTapWaste). Pathfinders (noStandardSiteAction)
  // develop via their own ability — they keep all their taps.
  const myAvatarUnit = state.units[avatarId]
  const myLiveSites = Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).length
  const banAvatarTapAbility = myLiveSites < 4 && !!myAvatarUnit && getScript(myAvatarUnit.name)?.noStandardSiteAction !== true

  // ── moves & attacks ── one 0-1 BFS per unit yields every reachable square AND its route (fused, so
  //     we don't re-run the BFS per destination). "Stay here and attack" is the empty-path option.
  for (const u of myUnits) {
    if (timeUp()) return out
    const here: { x: number; y: number; region: Region } = { x: u.x, y: u.y, region: u.region }
    const options: { dest: { x: number; y: number; region: Region }; path: { x: number; y: number; region: Region }[] }[] = [
      { dest: here, path: [] },
      ...reachableWithPaths(state, u),
    ]
    for (const { dest, path } of options) {
      if (path.length) push({ t: 'moveAttack', unitId: u.id, path }) // pure move (empty path = stay put)
      // attacks: any enemy unit at this square, or the site here
      for (const e of Object.values(state.units)) {
        if (e.controller === me || e.carriedBy) continue
        if (e.x === dest.x && e.y === dest.y && e.region === dest.region) push({ t: 'moveAttack', unitId: u.id, path, attack: { unit: e.id } })
      }
      const site = siteAt(state, dest.x, dest.y)
      if (site && site.controller !== null && site.controller !== me && !site.isRubble && dest.region === 'surface') {
        push({ t: 'moveAttack', unitId: u.id, path, attack: { site: site.id } })
      }
    }
  }

  // ── casts & site plays (skipped in board-only mode: the opponent-reply rollout only uses units
  //     already on the board, never new cards from hand — see bot_search.opponentBoardReply) ──
  if (!opts?.boardOnly) for (const cardId of state.players[me].hand) {
    if (timeUp()) return out
    const def = getCard(state.cards[cardId].name)
    if (def.type === 'Avatar') continue
    if (def.type === 'Site') {
      for (const sq of legalSiteSquares(state, me, def.name)) push({ t: 'avatarSite', mode: 'play', cardId, x: sq.x, y: sq.y })
      continue
    }
    if (opts?.noSpellCasts) continue // model development (sites) but not (unknown) spell casts — opponent rollout
    if (!canCast(state, me, cardId, avatarId).ok) continue // affordability / threshold / timing pre-filter
    if (def.type === 'Magic') {
      // enumerate valid target COMBINATIONS (Grapple Shot's ally, Bolt's victim…) — a targeted spell
      // cast without its targets fails "Missing targets." Projectile spells also need a direction.
      const script = getScript(def.name)
      const specs = (script?.targets ?? []) as { what?: string; count?: number; upTo?: boolean }[]
      const dirs: (string | undefined)[] = script?.shootsProjectile ? ['n', 's', 'e', 'w'] : [undefined]
      const combos = specs.length ? castTargetCombos(state, me, specs, state.units[avatarId]) : [[]]
      for (const targets of combos) for (const dir of dirs) {
        push(dir ? { t: 'castSpell', cardId, casterId: avatarId, targets, extra: { direction: dir } } : { t: 'castSpell', cardId, casterId: avatarId, targets })
      }
    } else if (def.type === 'Minion') {
      // pre-filter with the SAME validator castSpell uses (pure, no clone) so we don't clone-and-fail
      // on the many illegal squares — the surviving set is byte-identical to trial-applying them all
      for (const sq of placementSquares(state)) {
        for (const region of REGIONS) {
          if (validateSummonAt(state, me, def.name, { x: sq.x, y: sq.y, region }) === null) {
            push({ t: 'castSpell', cardId, casterId: avatarId, at: { x: sq.x, y: sq.y, region } })
          }
        }
      }
    } else {
      // Artifact / Aura: trial-apply confirms placement (fewer of these; no cheap shared validator)
      for (const sq of placementSquares(state)) push({ t: 'castSpell', cardId, casterId: avatarId, at: { x: sq.x, y: sq.y, region: 'surface' } })
    }
  }
  // draw a site off the atlas
  if (!opts?.boardOnly) push({ t: 'avatarSite', mode: 'draw' })

  // ── activated abilities (unit / site / artifact, incl. granted) ──
  const sources: { id: string; name: string }[] = [
    ...Object.values(state.units).filter((u) => u.controller === me).map((u) => ({ id: u.id, name: u.name })),
    ...Object.values(state.sites).filter((s) => s.controller === me && !s.isRubble).map((s) => ({ id: s.id, name: s.name })),
    ...Object.values(state.artifacts)
      .filter((a) => (a.carriedBy ? state.units[a.carriedBy]?.controller === me : a.conjuredBy === me))
      .map((a) => ({ id: a.id, name: a.name })),
  ]
  for (const src of sources) {
    if (timeUp()) return out
    const abilities = getScript(src.name)?.abilities ?? []
    const unit = state.units[src.id]
    const granted = unit ? grantedAbilities(state, unit) : []
    for (const ab of [...abilities, ...granted]) {
      if (canActivate(state, me, src.id, ab.key) !== null) continue // engine says not usable → skip
      if (banAvatarTapAbility && src.id === avatarId && ab.cost.tap) continue // develop instead (< 4 sites)
      push({ t: 'activate', sourceId: src.id, ability: ab.key }) // ability targets come via the follow-up prompt
    }
  }

  // ── pick up / drop artifacts & carried units (skipped in board-only mode) ──
  if (!opts?.boardOnly) for (const u of Object.values(state.units)) {
    if (u.controller !== me || u.carriedBy) continue
    const arts = Object.values(state.artifacts).filter((a) => !a.carriedBy && a.x === u.x && a.y === u.y && a.region === u.region)
    for (const a of arts) push({ t: 'pickUp', unitId: u.id, artifactIds: [a.id] })
    if (u.carrying.length) push({ t: 'drop', unitId: u.id, artifactIds: [...u.carrying] })
  }
  return out
}

/** Just the legal actions (no resulting states) — thin wrapper over expandActions. */
export function legalActions(state: GameState, player: PlayerId): Action[] {
  return expandActions(state, player).map((e) => e.action)
}

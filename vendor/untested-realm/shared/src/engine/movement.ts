import { getCard, type ParsedKeywords } from '../cards/db'
import type { GameState, PlayerId, Region, Step, UnitState } from './types'
import { GRID_H, GRID_W, inBounds, isOrthAdjacent, isDiagAdjacent, siteAt, isWaterSite, sameSquare, nearbySquaresW, orthAdjacentWrapped, occupiedSquares, edgesConnected } from './grid'
import { emitUnitMoved, makeCtx, avatarTrapBlocksMove, recordMoveAnim } from './effects'
import { detachFromCarrier } from './carrying'
import { getScript } from '../cards/scripts/registry'
import { effKeywords, isDisabled, isUnmodifiable, immobilizeImmune, terrainAt, siteSilenced, artifactSilenced } from './statics'


/** Do the SITE / artifact entry restrictions (Gnome Hollows' power cap, Great Wall, walls…) permit
 *  this unit to enter `to`? Shared by isLegalStep AND forced relocation (teleport / Blink / Teleport).
 *  `forced` = the unit is being RELOCATED by an effect, not stepping itself: then only ABSOLUTE entry
 *  bans (`entryFilterBlocksForcedEntry`, e.g. Gnome Hollows) apply — ground/positional step
 *  restrictions (Great Wall, Mountain Pass) don't stop a pull, so those are skipped when forced. */
export function siteEntryAllowed(state: GameState, unit: UnitState, from: Step, to: Step, forced = false, viaPush = false): boolean {
  // whether a forced relocation activates a given entry filter:
  //  · entryFilterBlocksForcedEntry → applies to ANY forced move incl. Teleport (Gnome Hollows).
  //  · entryFilterBlocksPush → applies only to a PUSH/pull/drag, NOT a Teleport (Perilous Bridge).
  const forcedActivates = (script: { entryFilterBlocksForcedEntry?: boolean; entryFilterBlocksPush?: boolean }) =>
    !!script.entryFilterBlocksForcedEntry || (viaPush && !!script.entryFilterBlocksPush)
  const deafToSites =
    unit.carrying.some((id) => getScript(state.artifacts[id]?.name ?? '')?.bearerIgnoresSites) ||
    (!!getScript(unit.name)?.ignoresSites && !unit.silenced)
  if (!deafToSites) {
    for (const s of Object.values(state.sites)) {
      const script = getScript(s.name)
      if (!script?.entryFilter || (forced && !forcedActivates(script))) continue
      if (!siteSilenced(state, s) && !script.entryFilter(state, s.id, unit, from, to)) return false
    }
  }
  for (const a of Object.values(state.artifacts)) {
    const script = getScript(a.name)
    if (!script?.entryFilter || artifactSilenced(state, a) || (forced && !forcedActivates(script))) continue
    if (!script.entryFilter(state, a.id, unit, from, to)) return false
  }
  return true
}

/** Is a single step legal for this unit right now? */
// `kw` (the unit's effective keywords) is INVARIANT for a fixed unit+state, but computing it is
// expensive (effKeywords scans the whole board). Callers that test MANY steps for the same unit
// (the enumeratePaths DFS, reachableLocations BFS, findPath BFS) precompute it once and pass it in;
// every other caller omits it and pays the default. Behaviour is identical either way.
export function isLegalStep(state: GameState, unit: UnitState, from: Step, to: Step, kw: ParsedKeywords = effKeywords(state, unit)): boolean {
  if (!inBounds(to.x, to.y)) return false
  if (kw.immobile || isDisabled(state, unit)) return false
  // Bog: units atop the marked site are Immobile — but a unit that "can't be immobilized" (Monks of
  // Kobalsa, Gossamer Ghost, an Onslaught'd ally…) isn't held by it.
  if (!immobilizeImmune(state, unit)) {
    for (const im of (state.flow?.immobileSites ?? []) as { siteId: string }[]) {
      const s = state.sites[im.siteId]
      if (s && unit.region === 'surface' && from.x === s.x && from.y === s.y) return false
    }
  }
  // border walls (Wall of Air / Ice) block steps across their edge
  if (from.region === 'surface' && to.region === 'surface') {
    for (const r of Object.values(state.auras)) {
      if (!r.edge) continue
      const blocks = getScript(r.name)?.wallBlocks
      if (blocks && crossesEdge(from, to, r.edge) && blocks(state, r, unit)) return false
    }
  }

  // the unit's own movement restrictions (Dalcean Phalanx, Sedge Crabs...)
  const selfFilter = getScript(unit.name)?.stepFilter
  if (selfFilter && !unit.silenced && !selfFilter(state, unit, from, to)) return false
  // sites/artifacts that block entry or passage (Gnome Hollows, Great Wall...)
  if (!siteEntryAllowed(state, unit, from, to)) return false
  // units that filter other units' movement (Undesirables)
  for (const u of Object.values(state.units)) {
    if (u.id === unit.id || u.silenced) continue
    const f = getScript(u.name)?.unitEntryFilter
    if (f && !f(state, u.id, unit, from, to)) return false
  }
  // Sphere of Animosity: a trapped avatar can't step to a square outside the trap (moving within
  // the trap's own squares is still fine — FAQ: "can't enter locations not occupied by the Sphere")
  if (avatarTrapBlocksMove(state, unit, to.x, to.y)) return false
  // card-granted extra steps (leaps, wraps, tunnels) are legal by definition
  for (const grantor of [unit, ...Object.values(state.units).filter((u) => u.id !== unit.id)]) {
    const script = getScript(grantor.name)
    if (grantor.silenced) continue
    const steps = grantor.id === unit.id ? script?.extraSteps?.(state, unit, from, grantor.id) ?? [] : []
    if (steps.some((s) => s.x === to.x && s.y === to.y && s.region === to.region)) return true
    const granted = grantor.id !== unit.id ? script?.grantsExtraSteps?.(state, grantor.id, unit, from) ?? [] : []
    if (granted.some((s) => s.x === to.x && s.y === to.y && s.region === to.region)) return true
  }
  // temporary adjacency webs (Marine Voyage, Minecart Madness, Waypoint Portal)
  if (from.region === 'surface' && to.region === 'surface') {
    for (const w of (state.flow?.tempAdjacency ?? []) as { player: PlayerId | null; turn: number; squares: { x: number; y: number }[] }[]) {
      if (w.turn !== state.turn) continue
      if (w.player !== null && w.player !== unit.controller) continue
      if (
        w.squares.some((s) => s.x === from.x && s.y === from.y) &&
        w.squares.some((s) => s.x === to.x && s.y === to.y) &&
        siteAt(state, to.x, to.y)
      ) return true
    }
  }
  for (const s of Object.values(state.sites)) {
    const extra = getScript(s.name)?.extraSteps
    if (extra && extra(state, unit, from, s.id).some((t) => t.x === to.x && t.y === to.y && t.region === to.region)) return true
  }
  for (const a of Object.values(state.artifacts)) {
    const extra = getScript(a.name)?.extraSteps
    if (extra && !artifactSilenced(state, a) && extra(state, unit, from, a.id).some((t) => t.x === to.x && t.y === to.y && t.region === to.region)) return true
  }

  // oversized: the anchor moves one orthogonal step; all four parts move with it
  // and every destination square must hold a site (surface only). With Magellan Globe the top and
  // bottom (and left/right) edges are joined, so the 2x2 footprint may STRADDLE an edge — its parts
  // wrap to the opposite edge (Mountain Giant FAQ 3). Without the Globe an oversized unit can't
  // balance on the edge, so the footprint must lie wholly in-bounds.
  if (unit.size === '2x2') {
    if (to.region !== 'surface' || from.region !== 'surface') return false
    if (!isOrthAdjacent(from, to)) return false
    const wrap = edgesConnected(state)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      let x = to.x + dx
      let y = to.y + dy
      if (wrap) { x = ((x % GRID_W) + GRID_W) % GRID_W; y = ((y % GRID_H) + GRID_H) % GRID_H }
      if (!inBounds(x, y) || !siteAt(state, x, y)) return false
    }
    return true
  }

  // rigid multi-square body (an Enchantress wall/2x1 aura minion, a Rack-stretched
  // avatar): the WHOLE shape shifts one orthogonal step, every part onto a site.
  // Growing bodies (amoebas — occupiesAllVisited) crawl via their own extraSteps and
  // are excluded here.
  if ((unit.extraSquares?.length ?? 0) > 0 && !getScript(unit.name)?.occupiesAllVisited) {
    if (to.region !== 'surface' || from.region !== 'surface') return false
    if (!isOrthAdjacent(from, to)) return false
    const dx = to.x - from.x
    const dy = to.y - from.y
    for (const s of occupiedSquares(unit)) {
      if (!inBounds(s.x + dx, s.y + dy) || !siteAt(state, s.x + dx, s.y + dy)) return false
    }
    return true
  }

  const sameSq = sameSquare(from, to)
  const orth = isOrthAdjacent(from, to)
  const diag = isDiagAdjacent(from, to)
  const toSite = siteAt(state, to.x, to.y)
  const toWater = toSite ? isWaterSite(state, toSite, getCard) : false

  // vertical step: surface ↔ subsurface of the same square
  if (sameSq && from.region !== to.region) {
    if (!toSite) return false
    if (from.region === 'surface' && to.region === 'underground') return !!kw.burrowing && !toWater
    if (from.region === 'underground' && to.region === 'surface') return !!kw.burrowing && !toWater
    if (from.region === 'surface' && to.region === 'underwater') return !!kw.submerge && toWater
    if (from.region === 'underwater' && to.region === 'surface') return !!kw.submerge && toWater
    return false
  }
  if (sameSq) return false

  // lateral step within a region
  if (from.region === to.region) {
    switch (to.region) {
      case 'surface': {
        if (!orth && !(diag && kw.airborne)) return false
        if (!toSite) return false // stepping into void is the voidwalk case below
        return true
      }
      case 'underground':
        return orth && !!kw.burrowing && !!toSite && !toWater
      case 'underwater':
        return orth && !!kw.submerge && !!toSite && toWater
      case 'void':
        return orth && !!kw.voidwalk && !toSite
    }
  }

  // region-crossing lateral step: underground ↔ underwater in an adjacent square,
  // in one step — a minion with BOTH Burrowing and Submerge (Codex). The
  // destination must be the matching subsurface: underwater needs a water site,
  // underground needs a land site.
  if (orth && kw.burrowing && kw.submerge && toSite) {
    if (from.region === 'underground' && to.region === 'underwater') return toWater
    if (from.region === 'underwater' && to.region === 'underground') return !toWater
  }

  // region-crossing lateral steps: void ↔ site (Voidwalk)
  if (kw.voidwalk && orth) {
    if (to.region === 'void' && !toSite) return true
    if (from.region === 'void' && toSite) {
      if (to.region === 'surface') return true
      if (to.region === 'underground') return !!kw.burrowing && !toWater
      if (to.region === 'underwater') return !!kw.submerge && toWater
    }
  }
  // airborne diagonal into void (still needs voidwalk to exist there) — but a DIAGONAL step is only ever
  // taken FROM the surface: an airborne unit starting in the void or the subsurface moves orthogonally only.
  if (from.region === 'surface' && kw.voidwalk && kw.airborne && diag && to.region === 'void' && !toSite) return true

  return false
}

export function maxSteps(state: GameState, unit: UnitState): number {
  // movement can be reduced below zero (editor "movement -1", debuffs); a unit never
  // gets fewer than 0 steps (0 = it can't move this turn).
  return Math.max(0, 1 + (effKeywords(state, unit).movement ?? 0))
}

/** does this step cost 0? ("moves freely", e.g. East-West Dragon sideways) */
export function isFreeStep(state: GameState, unit: UnitState, from: Step, to: Step): boolean {
  const free = getScript(unit.name)?.freeStep
  if (free && !unit.silenced && free(state, unit, from, to)) return true
  // sites can grant free steps too (Updraft Ridge)
  for (const s of Object.values(state.sites)) {
    const sf = getScript(s.name)?.siteFreeStep
    if (sf && !siteSilenced(state, s) && sf(state, s, unit, from, to)) return true
  }
  // ...and artifacts (Arcade of Bones: Undead in its row move freely)
  for (const a of Object.values(state.artifacts)) {
    const af = getScript(a.name)?.artifactFreeStep
    if (af && !artifactSilenced(state, a) && af(state, a.id, unit, from, to)) return true
  }
  return false
}

/** destinations granted by extraSteps hooks (leaps, wraps, tunnels) */
function extraStepsFor(state: GameState, unit: UnitState, from: Step): Step[] {
  const out: Step[] = []
  const own = getScript(unit.name)?.extraSteps
  if (own && !unit.silenced) out.push(...own(state, unit, from, unit.id))
  // other units granting steps (Ruler of Thul's edge wrap)
  for (const o of Object.values(state.units)) {
    if (o.id === unit.id || o.silenced) continue
    const g = getScript(o.name)?.grantsExtraSteps
    if (g) out.push(...g(state, o.id, unit, from))
  }
  // temporary adjacency webs (Marine Voyage, Minecart Madness, Waypoint Portal)
  for (const w of (state.flow?.tempAdjacency ?? []) as { player: PlayerId | null; turn: number; squares: { x: number; y: number }[] }[]) {
    if (w.turn !== state.turn) continue
    if (w.player !== null && w.player !== unit.controller) continue
    if (from.region !== 'surface') continue
    if (!w.squares.some((s) => s.x === from.x && s.y === from.y)) continue
    for (const s of w.squares) {
      if (s.x !== from.x || s.y !== from.y) out.push({ x: s.x, y: s.y, region: 'surface' })
    }
  }
  for (const s of Object.values(state.sites)) {
    const extra = getScript(s.name)?.extraSteps
    if (extra && !siteSilenced(state, s)) out.push(...extra(state, unit, from, s.id))
  }
  for (const a of Object.values(state.artifacts)) {
    const extra = getScript(a.name)?.extraSteps
    if (extra && !artifactSilenced(state, a)) out.push(...extra(state, unit, from, a.id))
  }
  return out
}

/**
 * All locations a unit could reach with its Move ability right now
 * (its "range of motion") — 0-1 BFS so free steps cost nothing.
 */
export function reachableLocations(state: GameState, unit: UnitState): Step[] {
  const kw = effKeywords(state, unit) // invariant — computed once, reused for budget + every isLegalStep
  const limit = Math.max(0, 1 + (kw.movement ?? 0)) // == maxSteps(state, unit)
  const start: Step = { x: unit.x, y: unit.y, region: unit.region }
  const key = (s: Step) => `${s.x},${s.y},${s.region}`
  const best = new Map<string, number>()
  best.set(key(start), 0)
  const out = new Map<string, Step>()
  // 0-1 BFS with a deque
  const deque: { s: Step; cost: number }[] = [{ s: start, cost: 0 }]
  while (deque.length) {
    const { s: from, cost } = deque.shift()!
    if ((best.get(key(from)) ?? Infinity) < cost) continue
    for (const to of [...candidateSteps(from), ...extraStepsFor(state, unit, from)]) {
      if (!isLegalStep(state, unit, from, to, kw)) continue
      const stepCost = isFreeStep(state, unit, from, to) ? 0 : 1
      const total = cost + stepCost
      if (total > limit) continue
      if ((best.get(key(to)) ?? Infinity) <= total) continue
      best.set(key(to), total)
      out.set(key(to), to)
      if (stepCost === 0) deque.unshift({ s: to, cost: total })
      else deque.push({ s: to, cost: total })
    }
  }
  out.delete(key(start))
  return [...out.values()]
}

/** Round-trip routes that leave the unit's own site and return to it, ending exactly where it
 *  started — the "move in place" a unit with spare movement can make (rulebook: a unit may spend
 *  its movement stepping out to an adjacent location and back). Only the SHORTEST such loops are
 *  returned — a single out-and-back hop off each reachable neighbour — as [neighbour, start] paths,
 *  so the caller can offer them like any other set of routes (and every departed-square effect still
 *  fires). Empty when the unit hasn't the budget to leave AND return (a plain 1-step unit can't). */
export function loopRoutes(state: GameState, unit: UnitState): Step[][] {
  const kw = effKeywords(state, unit) // invariant for this unit — computed once, reused for every step test
  const limit = Math.max(0, 1 + (kw.movement ?? 0))
  if (limit < 1) return []
  // oversized / rigid multi-square bodies shift their whole footprint; a bounce-in-place picker for
  // those is a separate problem, so leave them out (matches the client skipping 2x2 self-moves).
  if (unit.size === '2x2' || (unit.extraSquares?.length ?? 0) > 0) return []
  const start: Step = { x: unit.x, y: unit.y, region: unit.region }
  const same = (a: Step, b: Step) => a.x === b.x && a.y === b.y && a.region === b.region
  const routes: Step[][] = []
  const seen = new Set<string>()
  for (const n of [...candidateSteps(start), ...extraStepsFor(state, unit, start)]) {
    if (same(n, start) || seen.has(`${n.x},${n.y},${n.region}`)) continue
    if (n.region !== start.region) continue // a loop is a lateral out-and-back in the unit's own region (no dive-and-surface)
    if (!isLegalStep(state, unit, start, n, kw)) continue // can we step out to n…
    if (!isLegalStep(state, unit, n, start, kw)) continue // …and straight back onto our own site?
    const cost = (isFreeStep(state, unit, start, n) ? 0 : 1) + (isFreeStep(state, unit, n, start) ? 0 : 1)
    if (cost < 1 || cost > limit) continue
    seen.add(`${n.x},${n.y},${n.region}`)
    routes.push([{ ...n }, { ...start }])
  }
  return routes
}

/** Every DISTINCT SHORTEST legal path from `unit` to `dest` (≤ maxSteps, a specific step
 *  never repeated). The engine resolves whatever path it's given and is path-aware per
 *  step (departed-location effects: Giant Shark, Root Spider, Blaze), so the CLIENT only
 *  needs to ask the player to pick a route when MORE THAN ONE shortest path exists.
 *  Total explored paths are capped so a high-movement unit can't blow up the search. */
export function enumeratePaths(
  state: GameState,
  unit: UnitState,
  dest: Step,
  cap = 40,
  // `report.truncated` is set true if the exploration budget bailed before the search finished — the
  // returned routes may then be an INCOMPLETE subset, so the caller should offer Auto/Manual rather than
  // trust the set as "all routes". (Reachability/fastest path never depend on this — see the BFS helpers.)
  opts?: { allLengths?: boolean; report?: { truncated: boolean } },
): Step[][] {
  // effKeywords scans the whole board (~ms on a busy board); it's INVARIANT for this unit, so compute
  // it ONCE here and reuse for both the step budget and every isLegalStep — never per node/candidate.
  const kw = effKeywords(state, unit)
  const limit = Math.max(0, 1 + (kw.movement ?? 0)) // == maxSteps(state, unit), without re-scanning
  const dk = (s: { x: number; y: number; region: Region }) => `${s.x},${s.y},${s.region}`
  const goal = dk(dest)
  const start: Step = { x: unit.x, y: unit.y, region: unit.region }
  const all: Step[][] = []
  const used = new Set<string>()
  // Admissible lower bound on the steps still needed to reach the destination: Chebyshev
  // distance (one step — even a diagonal Airborne one — closes at most 1 in each axis),
  // wrap-aware under Magellan Globe. Never over-estimates, so pruning on it can't drop a
  // real route; it just keeps the DFS goal-directed instead of exploring the whole board.
  const wrap = edgesConnected(state)
  const minSteps = (from: { x: number; y: number }): number => {
    let dx = Math.abs(from.x - dest.x)
    let dy = Math.abs(from.y - dest.y)
    if (wrap) { dx = Math.min(dx, GRID_W - dx); dy = Math.min(dy, GRID_H - dy) }
    return Math.max(dx, dy)
  }
  // The `cap` bounds COMPLETED routes, but a board full of free-step sites (Arcade of Bones, several
  // Updraft Ridges) makes the number of distinct partial TRAILS super-exponential, so finding even a
  // few completed routes could visit astronomically many partials. This hard budget on DFS expansions
  // guarantees the call returns fast: we only need enough routes to offer the picker (the true reachable
  // set comes from reachableLocations, and Auto/bot use findPath — neither depends on full enumeration).
  let visits = 0
  let bailed = false
  const t0 = Date.now()
  // Is ANY free step even possible for this unit on this board? (its own freeStep, a site's
  // siteFreeStep, or an artifact's artifactFreeStep — matching isFreeStep's sources). When NONE
  // apply, every step costs 1, which unlocks an admissible distance prune below. Computed ONCE
  // (not per node) so it's cheap. The common board has no free-step source → the prune fires.
  const freeStepPossible =
    (!!getScript(unit.name)?.freeStep && !unit.silenced) ||
    Object.values(state.sites).some((s) => getScript(s.name)?.siteFreeStep && !siteSilenced(state, s)) ||
    Object.values(state.artifacts).some((a) => getScript(a.name)?.artifactFreeStep && !artifactSilenced(state, a))
  const dfs = (from: Step, path: Step[], cost: number): void => {
    if (bailed || all.length >= cap) return // stop once we have enough routes for the picker
    // Hard budget — the ONLY termination/speed guard. Free-step corridors make the number of distinct
    // partial trails super-exponential, so we cap BOTH total DFS expansions (a proxy) AND wall-clock time
    // (a hard bound regardless of board density — per-visit cost grows with sites/units/artifacts). NO
    // route-dropping length/cost prune is used (an allowance would silently drop legal free-step glides):
    // correctness stays with the per-edge `used` set (each route is a trail) + the per-step cost gate. On
    // bail the client falls back to Auto (findPath) / Manual, so reachability is never lost — this feeds
    // only the PICKER (the bot/engine use the BFS helpers, never this). A wall-clock cut is safe here for
    // exactly that reason: it can't perturb game logic or determinism.
    if (++visits > 1200 || Date.now() - t0 > 250) { bailed = true; if (opts?.report) opts.report.truncated = true; return }
    if (dk(from) === goal && path.length > 0) { all.push([...path]); return } // reached dest — stop
    // Try steps that get CLOSER to the destination FIRST. This goal-directed ordering fills the route
    // cap quickly (the common case returns in a handful of visits) WITHOUT pruning anything — a free
    // step away from the goal is still explored, just later, so no glide route is ever dropped.
    const cands = [...candidateSteps(from), ...extraStepsFor(state, unit, from)].sort((a, b) => minSteps(a) - minSteps(b))
    for (const to of cands) {
      if (bailed) break // once the budget bails, unwind the whole stack WITHOUT re-evaluating candidates
      // Admissible distance prune: with NO free-step source every step costs 1, so reaching `to` (one
      // costed step) then closing the remaining Chebyshev distance needs ≥ cost+1+minSteps(to) COSTED
      // steps. If that exceeds the budget, `to` can never lead to the destination — skip it BEFORE the
      // expensive isLegalStep (which scans every unit/site/aura). Never drops a real route (Chebyshev is
      // an admissible lower bound); with free steps present it's disabled (a 0-cost glide can still close
      // distance), preserving every glide route. This is what keeps a small search well under the budget.
      if (!freeStepPossible && cost + 1 + minSteps(to) > limit) continue
      if (!isLegalStep(state, unit, from, to, kw)) continue
      const sk = `${from.x},${from.y},${from.region}->${to.x},${to.y},${to.region}`
      if (used.has(sk)) continue
      // a free step (Updraft Ridge glide, East-West Dragon, Arcade of Bones) costs 0, so a route may have
      // MORE steps than its cost limit; only COSTED over-budget steps are rejected here.
      const c = isFreeStep(state, unit, from, to) ? 0 : 1
      if (cost + c > limit) continue
      used.add(sk); path.push(to)
      dfs(to, path, cost + c)
      path.pop(); used.delete(sk)
    }
  }
  dfs(start, [], 0)
  if (!all.length) return []
  // `allLengths` keeps every route (the arrows / route-complexity gate want them all);
  // the default keeps only the shortest ones (the auto pick).
  if (opts?.allLengths) return all
  const min = Math.min(...all.map((p) => p.length))
  return all.filter((p) => p.length === min)
}

/**
 * Every legal SINGLE step a unit can take from `from` (deduped by destination
 * location+region). Used by the client's manual-stepping mode — it includes
 * diagonals (Airborne), vertical burrow/submerge/surface, and region-crossing
 * steps exactly as `isLegalStep` allows for THIS unit.
 */
export function legalStepsFrom(state: GameState, unit: UnitState, from: Step): Step[] {
  const out: Step[] = []
  const seen = new Set<string>()
  const kw = effKeywords(state, unit)
  for (const to of [...candidateSteps(from), ...extraStepsFor(state, unit, from)]) {
    if (!isLegalStep(state, unit, from, to, kw)) continue
    const k = `${to.x},${to.y},${to.region}`
    if (seen.has(k)) continue
    seen.add(k); out.push(to)
  }
  return out
}

function candidateSteps(from: Step): Step[] {
  const out: Step[] = []
  const regions: Region[] = ['surface', 'underground', 'underwater', 'void']
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = from.x + dx
      const y = from.y + dy
      if (!inBounds(x, y)) continue
      for (const region of regions) out.push({ x, y, region })
    }
  }
  return out
}

/**
 * Execute a declared path step by step; illegal steps are skipped (rulebook:
 * "confirm that it is a legal step at that moment. If it is not legal, you do
 * not take that step, and continue resolving anything remaining").
 * Returns the number of steps actually taken.
 */
/** does a step from→to cross this wall's edge (either direction)? */
export function crossesEdge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  edge: { a: { x: number; y: number }; b: { x: number; y: number } },
): boolean {
  const same = (p: { x: number; y: number }, q: { x: number; y: number }) => p.x === q.x && p.y === q.y
  return (same(from, edge.a) && same(to, edge.b)) || (same(from, edge.b) && same(to, edge.a))
}

export function resolveMovement(state: GameState, unit: UnitState, path: Step[]): number {
  let taken = 0
  const usedSteps = new Set<string>()
  let current: Step = { x: unit.x, y: unit.y, region: unit.region }
  const visited: Step[] = [{ x: unit.x, y: unit.y, region: unit.region }] // for the client step-by-step animation
  for (const step of path) {
    const k = `${current.x},${current.y},${current.region}->${step.x},${step.y},${step.region}`
    if (usedSteps.has(k)) continue // may not repeat specific steps
    if (!isLegalStep(state, unit, current, step)) continue
    usedSteps.add(k)
    const from = { x: unit.x, y: unit.y, region: unit.region }
    // Blaze: the runner leaves a fire trail at departed locations
    const blaze = (state.flow?.blazeTrail ?? []).find((e: any) => e.unitId === unit.id && e.turn === state.turn)
    // record the departed square once — a revisited square must not double-deal (dedup here, not in the damage loop)
    if (blaze && from.region === 'surface' && !blaze.squares.some((s: { x: number; y: number }) => s.x === from.x && s.y === from.y)) {
      blaze.squares.push({ x: from.x, y: from.y })
    }
    // growing bodies keep every square they have ever occupied (Megamoeba, Aethermoeba)
    if (getScript(unit.name)?.occupiesAllVisited && !unit.silenced) {
      unit.extraSquares = unit.extraSquares ?? []
      if (!unit.extraSquares.some((s) => s.x === from.x && s.y === from.y)) {
        unit.extraSquares.push({ x: from.x, y: from.y, region: from.region })
      }
    } else if ((unit.extraSquares?.length ?? 0) > 0) {
      // rigid body: the extra squares shift with the anchor by the step delta
      const dx = step.x - from.x
      const dy = step.y - from.y
      unit.extraSquares = unit.extraSquares!.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy }))
    }
    unit.x = step.x
    unit.y = step.y
    unit.region = step.region
    // Stepping off your carrier's square ends the ride NOW (rulebook: a carried unit that moves where
    // its carrier isn't ceases to be carried) — before this step's entry triggers run. Otherwise a
    // trigger's checkStateBased (flipped-Druid thorns, Briar Patch…) re-syncs the still-"carried" mover
    // back onto its carrier (syncCarried keeps cargo co-located), stranding the move and whiffing the
    // attack. Mirrors the forced-move/teleport path, which already detaches mid-step.
    if (unit.carriedBy) {
      const carrier = state.units[unit.carriedBy]
      if (!carrier || carrier.x !== unit.x || carrier.y !== unit.y || carrier.region !== unit.region) detachFromCarrier(state, unit)
    }
    // walls the step passed through burn/prick the mover (Wall of Fire, Brambles)
    if (from.region === 'surface' && step.region === 'surface') {
      for (const r of Object.values(state.auras)) {
        if (!r.edge || !crossesEdge(from, step, r.edge)) continue
        const onCross = getScript(r.name)?.wallOnCross
        if (onCross) onCross(makeCtx(state, r.id, r.controller, []), r, unit)
        if (!state.units[unit.id]) return taken
      }
    }
    // final=true only on the LAST square of the walk — so "when it stops here" triggers (Vaults of
    // Zul, Flame of the First Ones) fire once at the destination, not at every square passed through.
    emitUnitMoved(state, unit, from, 'move', step === path[path.length - 1]) // the unit's own basic movement (Skirmishers of Mu fires only here)
    if (!state.units[unit.id]) return taken // a trigger killed the mover mid-path
    current = step
    visited.push({ x: unit.x, y: unit.y, region: unit.region })
    taken++
  }
  // animate the walk for ANY actual move — including a single hop into an adjacent empty site, which used
  // to snap instantly and so read as "only attacks animate" (an attack is usually a multi-step approach).
  if (taken >= 1 && state.units[unit.id]) recordMoveAnim(state, unit.id, unit.name, visited)
  return taken
}

/**
 * Every reachable location AND a shortest path to each — a SINGLE 0-1 BFS that fuses
 * `reachableLocations` (the reachable set) with `findPath` (the route). Callers that need a path per
 * destination (the search's move generator) would otherwise run one full BFS per destination; this
 * runs one BFS total and reconstructs each route from the shared predecessor map. Because the BFS
 * traversal order is identical to `findPath`'s, the reconstructed path for any destination is the SAME
 * route `findPath` would return — so the resulting (path-aware) states are byte-identical, just far
 * cheaper to enumerate. The start square is excluded (it has no move).
 */
export function reachableWithPaths(state: GameState, unit: UnitState): { dest: Step; path: Step[] }[] {
  const kw = effKeywords(state, unit) // invariant — computed once, reused for budget + every isLegalStep
  const limit = Math.max(0, 1 + (kw.movement ?? 0)) // == maxSteps(state, unit)
  const start: Step = { x: unit.x, y: unit.y, region: unit.region }
  const key = (s: Step) => `${s.x},${s.y},${s.region}`
  const startKey = key(start)
  const best = new Map<string, number>()
  const prev = new Map<string, Step>()
  const out = new Map<string, Step>()
  best.set(startKey, 0)
  const deque: { s: Step; cost: number }[] = [{ s: start, cost: 0 }]
  while (deque.length) {
    const { s: from, cost } = deque.shift()!
    if ((best.get(key(from)) ?? Infinity) < cost) continue
    for (const to of [...candidateSteps(from), ...extraStepsFor(state, unit, from)]) {
      if (!isLegalStep(state, unit, from, to, kw)) continue
      const stepCost = isFreeStep(state, unit, from, to) ? 0 : 1
      const total = cost + stepCost
      if (total > limit) continue
      if ((best.get(key(to)) ?? Infinity) <= total) continue
      best.set(key(to), total)
      prev.set(key(to), from)
      out.set(key(to), to)
      if (stepCost === 0) deque.unshift({ s: to, cost: total })
      else deque.push({ s: to, cost: total })
    }
  }
  out.delete(startKey)
  const res: { dest: Step; path: Step[] }[] = []
  for (const dest of out.values()) {
    const path: Step[] = []
    let cur: Step | undefined = dest
    while (cur && key(cur) !== startKey) { path.unshift(cur); cur = prev.get(key(cur)) }
    res.push({ dest, path })
  }
  return res
}

/** 0-1 BFS a legal path (≤ maxSteps of cost) from the unit's position to `dest`. */
export function findPath(state: GameState, unit: UnitState, dest: Step): Step[] | null {
  const kw = effKeywords(state, unit) // invariant — computed once, reused for budget + every isLegalStep
  const limit = Math.max(0, 1 + (kw.movement ?? 0)) // == maxSteps(state, unit)
  const key = (s: Step) => `${s.x},${s.y},${s.region}`
  const start: Step = { x: unit.x, y: unit.y, region: unit.region }
  if (key(start) === key(dest)) return []
  const best = new Map<string, number>()
  const prev = new Map<string, Step>()
  best.set(key(start), 0)
  const deque: { s: Step; cost: number }[] = [{ s: start, cost: 0 }]
  while (deque.length) {
    const { s: from, cost } = deque.shift()!
    if ((best.get(key(from)) ?? Infinity) < cost) continue
    for (const to of [...candidateSteps(from), ...extraStepsFor(state, unit, from)]) {
      if (!isLegalStep(state, unit, from, to, kw)) continue
      const stepCost = isFreeStep(state, unit, from, to) ? 0 : 1
      const total = cost + stepCost
      if (total > limit) continue
      if ((best.get(key(to)) ?? Infinity) <= total) continue
      best.set(key(to), total)
      prev.set(key(to), from)
      if (stepCost === 0) deque.unshift({ s: to, cost: total })
      else deque.push({ s: to, cost: total })
    }
  }
  if (!best.has(key(dest))) return null
  const path: Step[] = []
  let cur: Step | undefined = dest
  while (cur && key(cur) !== key(start)) {
    path.unshift(cur)
    cur = prev.get(key(cur))
  }
  return path
}

/** terrain-aware region of a square's subsurface */
export function subsurfaceRegion(state: GameState, x: number, y: number): Region | null {
  const t = terrainAt(state, x, y)
  if (t === 'void') return null
  return t === 'water' ? 'underwater' : 'underground'
}

// ---- Sorcery "step" measurements (two distinct meanings) ----

/**
 * Distance between two locations in STEPS — Sorcery definition 1, used for
 * "up to X steps away" (Dispel, Payload Trebuchet, Sleep) and push/pull/drag
 * forced movement (Whirlwind, Wind Sylph). One step = one adjacent (orthogonal)
 * location in the same region → Manhattan distance. Airborne/region-crossing do
 * NOT apply: you're measuring distance, not moving of your own volition.
 */
export function stepDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/** Step distance (definition 1), Magellan-aware: each axis takes the SHORT way round the joined edges
 *  when a Magellan Globe is in play, else plain Manhattan. "Up to X steps away" range checks (Sleep,
 *  the explosions, trebuchets, ballistae…) must use THIS so a square that is close only via the wrap
 *  is in range (FAQ: adjacency — and therefore "steps away" — spans the connected edges). */
export function stepDistanceW(state: GameState, a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (!edgesConnected(state)) return stepDistance(a, b)
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y)
  return Math.min(dx, GRID_W - dx) + Math.min(dy, GRID_H - dy)
}

/**
 * REAL "steps away": the shortest path from `a` to `b` taking one orthogonal step per adjacent
 * LOCATION, routing AROUND the void — you can't step through a siteless square (the void), so a target
 * with a void between it and the caster is farther than its Manhattan distance (e.g. 4, not 2), or
 * unreachable entirely. Magellan-aware (steps wrap the joined seam). This is the rules-correct metric
 * for "up to N steps away" range checks; plain stepDistanceW (Manhattan) wrongly counts straight through
 * the void. Intermediate squares must be sites; the destination itself may be a void location (you can
 * still lob an effect AT the void, you just can't path THROUGH it). Returns Infinity if unreachable.
 */
export function realStepDistanceW(state: GameState, a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (a.x === b.x && a.y === b.y) return 0
  const seen = new Set<string>([`${a.x},${a.y}`])
  let frontier: { x: number; y: number }[] = [{ x: a.x, y: a.y }]
  let dist = 0
  while (frontier.length) {
    dist++
    const next: { x: number; y: number }[] = []
    for (const cur of frontier) {
      for (const n of orthAdjacentWrapped(state, cur.x, cur.y)) {
        const k = `${n.x},${n.y}`
        if (seen.has(k)) continue
        if (n.x === b.x && n.y === b.y) return dist // reached the target location
        seen.add(k)
        if (siteAt(state, n.x, n.y)) next.push(n) // can only continue the path across real locations
      }
    }
    frontier = next
  }
  return Infinity
}

/**
 * The legal squares a unit reaches by taking ONE step of its own relative to
 * `ref` — Sorcery definition 2 ("take a step" / "move one step": Coy Nixie,
 * Guile Sirens, Persecutor, the automata). The mover uses its OWN abilities:
 * Airborne steps diagonally (Chebyshev metric, 8 neighbours), grounded steps
 * orthogonally (Manhattan, 4 neighbours); Immobile or otherwise-blocked steps are
 * excluded via isLegalStep. `dir` selects steps that get closer or farther.
 *
 * Topology is Magellan-aware: the neighbourhood is drawn from the WRAPPED
 * primitives (orthAdjacentWrapped / nearbySquaresW), so an edge square's step
 * across the joined border is a real candidate, and "closer/farther" is measured
 * with the wrapped distance (each axis shrinks to the short way round the globe).
 * isLegalStep then confirms the wrapped destination the same way normal movement
 * does. Without a Magellan Globe every wrap is a no-op, so this is unchanged.
 */
export function selfStepsToward(
  state: GameState,
  mover: UnitState,
  ref: { x: number; y: number },
  dir: 'closer' | 'away' = 'closer',
): Step[] {
  const air = !!effKeywords(state, mover).airborne
  const wrap = edgesConnected(state)
  const axis = (a: number, b: number, size: number) => {
    const d = Math.abs(a - b)
    return wrap ? Math.min(d, size - d) : d
  }
  const dist = (x: number, y: number) =>
    air ? Math.max(axis(x, ref.x, GRID_W), axis(y, ref.y, GRID_H)) : axis(x, ref.x, GRID_W) + axis(y, ref.y, GRID_H)
  const cur = dist(mover.x, mover.y)
  const from: Step = { x: mover.x, y: mover.y, region: mover.region }
  return (air ? nearbySquaresW(state, mover.x, mover.y) : orthAdjacentWrapped(state, mover.x, mover.y))
    .filter((s) => !(s.x === mover.x && s.y === mover.y))
    .filter((s) => (dir === 'closer' ? dist(s.x, s.y) < cur : dist(s.x, s.y) > cur))
    .filter((s) => isLegalStep(state, mover, from, { x: s.x, y: s.y, region: mover.region }))
    .map((s) => ({ x: s.x, y: s.y, region: mover.region }))
}
export const selfStepsCloser = (state: GameState, mover: UnitState, ref: { x: number; y: number }) =>
  selfStepsToward(state, mover, ref, 'closer')
export const selfStepsAway = (state: GameState, mover: UnitState, ref: { x: number; y: number }) =>
  selfStepsToward(state, mover, ref, 'away')

/**
 * The squares one FORCED step from `mover` relative to `ref` — Sorcery
 * definition 1 (push/pull/drag: Maelström, Whirlwind, Wind Sylph). The unit is
 * NOT moving of its own volition, so: one orthogonal square (Manhattan), same
 * region only, no Airborne diagonals. Surface destinations must have a site.
 * Magellan-aware: the neighbourhood wraps (orthAdjacentWrapped) and closer/farther
 * uses the wrapped distance, so a unit at the edge can be shoved across the joined
 * border. Without a Globe every wrap is a no-op, so this is unchanged.
 */
export function forcedStepsToward(
  state: GameState,
  mover: UnitState,
  ref: { x: number; y: number },
  dir: 'closer' | 'away' = 'closer',
): Step[] {
  const cur = stepDistanceW(state, mover, ref)
  return orthAdjacentWrapped(state, mover.x, mover.y)
    .filter((s) => (dir === 'closer' ? stepDistanceW(state, s, ref) < cur : stepDistanceW(state, s, ref) > cur))
    .filter((s) => (mover.region === 'surface' ? !!siteAt(state, s.x, s.y) : true))
    .map((s) => ({ x: s.x, y: s.y, region: mover.region }))
}

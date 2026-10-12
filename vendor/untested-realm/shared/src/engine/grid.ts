import type { GameState, Region, SiteState, UnitState, PlayerId, Step } from './types'
import { getScript } from '../cards/scripts/registry'
import { findCard } from '../cards/db'

/** A double-faced card flipped to a side it doesn't have (Vivien borrowing the Druid's flip) is a
 *  blanked HUSK: per the FAQ it "is no longer a minion, has no card type or abilities". It still
 *  physically occupies its square, but it is NOT a unit — so `unitsAt` excludes it while `occupantsAt`
 *  (physical presence) still counts it. Mirrors statics.isBlanked (kept local to avoid an import cycle). */
function isBlankedHusk(u: UnitState): boolean {
  return !!u.flipped && !findCard(u.name)?.flipText
}

export const GRID_W = 5
export const GRID_H = 4

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H
}

/** Human-facing square name in chess-like notation: column letter (a–e, left→right) + row number
 *  (1–4, top→bottom). e.g. (0,0)→"a1", (2,1)→"c2", (4,3)→"e4". The single place any coordinate is
 *  formatted for a player — logs, prompts, the editor and the board overlay all route through here,
 *  so the displayed system stays consistent everywhere. */
export function squareLabel(x: number, y: number): string {
  return String.fromCharCode(97 + x) + (y + 1)
}

export function siteAt(state: GameState, x: number, y: number): SiteState | null {
  for (const site of Object.values(state.sites)) {
    if (site.x === x && site.y === y) return site
  }
  return null
}

/** Magellan Globe: "Opposite edges of the realm are connected." Global while the artifact is in play —
 *  but a SILENCED Globe (Acid Rain) has lost its text and connects nothing. (The silence check is
 *  inlined — a faithful copy of statics.artifactSilenced — to avoid a grid↔statics import cycle.) */
export function edgesConnected(state: GameState): boolean {
  return Object.values(state.artifacts).some((a) => {
    if (a.name !== 'Magellan Globe') return false
    const x = a.carriedBy ? state.units[a.carriedBy]?.x ?? a.x : a.x
    const y = a.carriedBy ? state.units[a.carriedBy]?.y ?? a.y : a.y
    return !Object.values(state.auras).some((r) => getScript(r.name)?.auraSilencesArtifacts && r.squares.some((q) => q.x === x && q.y === y))
  })
}

/** the squares a standard 2x2 aura anchored at `at` (top-left) covers: clipped to
 *  the board, or wrapped to the opposite edge when Magellan Globe connects them. */
export function aura2x2Squares(at: { x: number; y: number }, wrap: boolean): { x: number; y: number }[] {
  const seen = new Set<string>()
  const out: { x: number; y: number }[] = []
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    let sx = at.x + dx
    let sy = at.y + dy
    if (!inBounds(sx, sy)) {
      if (!wrap) continue
      sx = ((sx % GRID_W) + GRID_W) % GRID_W
      sy = ((sy % GRID_H) + GRID_H) % GRID_H
    }
    const k = `${sx},${sy}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ x: sx, y: sy })
  }
  return out
}

/** The 4 orthogonally-adjacent squares (excluding the center), clipped to the board — or WRAPPED
 *  to the opposite edge when Magellan Globe connects them. For effects that reach into an adjacent
 *  square and must honor the Globe like everything else (Pathfinder blazing a trail). */
export function orthAdjacentWrapped(state: GameState, x: number, y: number): { x: number; y: number }[] {
  const wrap = edgesConnected(state)
  const out: { x: number; y: number }[] = []
  const seen = new Set<string>()
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    let sx = x + dx
    let sy = y + dy
    if (!inBounds(sx, sy)) {
      if (!wrap) continue
      sx = ((sx % GRID_W) + GRID_W) % GRID_W
      sy = ((sy % GRID_H) + GRID_H) % GRID_H
    }
    const k = `${sx},${sy}`
    if ((sx === x && sy === y) || seen.has(k)) continue
    seen.add(k)
    out.push({ x: sx, y: sy })
  }
  return out
}

/**
 * Water site = provides at least one water threshold RIGHT NOW (rubble never
 * does). This is fully dynamic: it counts the site's printed water plus any
 * per-instance choice (Valley of Delight chosen as Water) and aura bonuses
 * (Sow the Earth), respects Drought drying it out, and treats flooded sites as
 * water. Mirrors the water component of affinity() so "is this a water site?"
 * always tracks the threshold the site actually provides at this moment.
 */
export function isWaterSite(state: GameState, site: SiteState, defs: (name: string) => { thresholds: { water: number } }): boolean {
  // Rubble is dry land — UNLESS it has been flooded (The Great Drowning of Men floods the rubble
  // it leaves behind), making it a body of water: its subsurface is underwater, so a Submerge
  // minion sunk there survives while everything else drowns (was: all rubble read as 'land', so
  // canExistIn('underwater') was false there and even Submerge minions drowned).
  if (site.isRubble) return !!site.flooded
  // Drought: covered sites provide no water threshold (and no flood bonus)
  const dried = Object.values(state.auras).some(
    (r) => getScript(r.name)?.driesSites && r.squares.some((s) => s.x === site.x && s.y === site.y),
  )
  if (dried) return false
  if (site.flooded) return true
  let water = defs(site.name).thresholds.water
  water += getScript(site.name)?.siteExtraThreshold?.(state, site)?.water ?? 0
  for (const r of Object.values(state.auras)) {
    water += getScript(r.name)?.auraSiteExtraThreshold?.(state, r, site)?.water ?? 0
  }
  return water > 0
}

/** squares orthogonally adjacent, plus own square */
export function adjacentSquares(x: number, y: number): { x: number; y: number }[] {
  const out = [{ x, y }]
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (inBounds(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy })
  }
  return out
}

/** own square + all 8 surrounding squares */
export function nearbySquares(x: number, y: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (inBounds(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy })
    }
  }
  return out
}

/** shared: the given offset neighbourhood around (x,y), clipped to the board — or edge-WRAPPED
 *  to the opposite side when Magellan Globe connects the edges. Dedupes wrapped collisions. */
function neighboursWrapped(state: GameState, x: number, y: number, offs: readonly (readonly [number, number])[]): { x: number; y: number }[] {
  const wrap = edgesConnected(state)
  const out: { x: number; y: number }[] = []
  const seen = new Set<string>()
  for (const [dx, dy] of offs) {
    let sx = x + dx
    let sy = y + dy
    if (!inBounds(sx, sy)) {
      if (!wrap) continue
      sx = ((sx % GRID_W) + GRID_W) % GRID_W
      sy = ((sy % GRID_H) + GRID_H) % GRID_H
    }
    const k = `${sx},${sy}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ x: sx, y: sy })
  }
  return out
}
const ADJ_OFFS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const
const NEAR_OFFS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const
/** adjacentSquares (own + 4 orthogonal), edge-wrapped under Magellan Globe (state-aware). */
export function adjacentSquaresW(state: GameState, x: number, y: number): { x: number; y: number }[] {
  return neighboursWrapped(state, x, y, ADJ_OFFS)
}
/** nearbySquares (own + 8 surrounding), edge-wrapped under Magellan Globe (state-aware). */
export function nearbySquaresW(state: GameState, x: number, y: number): { x: number; y: number }[] {
  return neighboursWrapped(state, x, y, NEAR_OFFS)
}

export function sameSquare(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y
}

export function isOrthAdjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
}

export function isDiagAdjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) === 1 && Math.abs(a.y - b.y) === 1
}

export function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/** Chebyshev distance, Magellan-aware: each axis takes the SHORT way round the joined edges when a
 *  Magellan Globe is in play (opposite edges connected), else plain Chebyshev. Use for "within/up to
 *  X steps" range gates on diagonal-aware effects so a wrap-close square is reachable (FAQ: adjacency
 *  and "steps away" span the edges). */
export function chebyshevW(state: GameState, a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (!edgesConnected(state)) return chebyshev(a, b)
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y)
  return Math.max(Math.min(dx, GRID_W - dx), Math.min(dy, GRID_H - dy))
}

/** all squares a unit occupies (oversized units span a 2x2 area from their
 *  anchor; growing/stretched bodies add their extraSquares) */
export function occupiedSquares(unit: UnitState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  if (unit.size === '2x2') {
    // the 2x2 footprint; it modulo-WRAPS to the opposite edge for an edge-anchored oversized unit
    // (only reachable under Magellan Globe — a normal summon can't straddle the edge, so wrap is a no-op)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const wx = (((unit.x + dx) % GRID_W) + GRID_W) % GRID_W
      const wy = (((unit.y + dy) % GRID_H) + GRID_H) % GRID_H
      if (!out.some((o) => o.x === wx && o.y === wy)) out.push({ x: wx, y: wy })
    }
  } else {
    out.push({ x: unit.x, y: unit.y })
  }
  for (const s of unit.extraSquares ?? []) {
    if (inBounds(s.x, s.y) && !out.some((o) => o.x === s.x && o.y === s.y)) out.push({ x: s.x, y: s.y })
  }
  return out
}

export function occupies(unit: UnitState, x: number, y: number, region?: Region): boolean {
  // extra body squares carry their own region tag (a moeba can straddle void and site)
  if (
    unit.extraSquares?.some(
      (s) => s.x === x && s.y === y && (region === undefined || (s.region ?? unit.region) === region),
    )
  )
    return true
  if (region !== undefined && unit.region !== region) return false
  if (unit.size === '2x2') {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const wx = (((unit.x + dx) % GRID_W) + GRID_W) % GRID_W // wraps under Magellan Globe (else no-op)
      const wy = (((unit.y + dy) % GRID_H) + GRID_H) % GRID_H
      if (wx === x && wy === y) return true
    }
    return false
  }
  return unit.x === x && unit.y === y
}

/** Everything physically present at a location — INCLUDING a blanked face-down husk (which occupies
 *  its square but is no longer a unit). Use this only for physical-presence questions (emptiness of a
 *  site, void occupancy). For "units that can be affected/targeted/counted", use `unitsAt`. */
export function occupantsAt(state: GameState, x: number, y: number, region?: Region): UnitState[] {
  return Object.values(state.units).filter((u) => occupies(u, x, y, region))
}

/** The UNITS (minions/avatars) at a location. Excludes a blanked face-down husk — per the FAQ it has
 *  no card type and is no longer a unit, so it is never damaged/targeted/counted as one (it's only
 *  swept by "destroy everything" effects like Roots of Yggdrasil, which iterate state.units directly). */
export function unitsAt(state: GameState, x: number, y: number, region?: Region): UnitState[] {
  return Object.values(state.units).filter((u) => occupies(u, x, y, region) && !isBlankedHusk(u))
}

export function unitsOf(state: GameState, player: PlayerId): UnitState[] {
  return Object.values(state.units).filter((u) => u.controller === player)
}

/** A site/location is EMPTY only if nothing occupies it — "empty means empty":
 *   • no OCCUPANTS in any region (surface, underground/underwater, void) — this INCLUDES avatars and a
 *     face-down/blanked flipped card (a Vivien flipped to a side she lacks is no longer a unit, but per
 *     the FAQ it still exists and OCCUPIES its square — "she could turn off Pristine Paradise"). Hence
 *     `occupantsAt`, NOT `unitsAt` (which excludes the husk as a non-unit).
 *   • no ground (non-carried) artifact on it (a carried artifact implies a unit → already caught).
 *   • no aura covering it (an area enchantment sitting on the site). Edge/wall auras sit on the border
 *     BETWEEN squares, not on the site, so they don't count.
 *  Rubble-vs-real-site is a separate question the caller decides; this is purely "is anything here". */
export function isSiteEmpty(state: GameState, x: number, y: number): boolean {
  if (occupantsAt(state, x, y).length > 0) return false // occupancy — a face-down husk still counts
  if (Object.values(state.artifacts).some((a) => !a.carriedBy && a.x === x && a.y === y)) return false
  if (Object.values(state.auras).some((r) => !r.edge && r.squares?.some((s) => s.x === x && s.y === y))) return false
  return true
}

export function avatarOf(state: GameState, player: PlayerId): UnitState {
  return state.units[state.players[player].avatarUnitId]
}

/**
 * The location/region anchor used to validate an activated ability's targets.
 *
 * Ability target specs express range (`where:` here/adjacent/nearby) and region
 * (`targeted:`) RELATIVE TO THE SOURCE CARD, per the rulebook: "Here/There refer
 * to the location(s) a card occupies" and "adjacent/nearby locations are only
 * those in the same region as the referencing card (or its Spellcaster)".
 *
 * - source is a unit  → the unit itself (avatars, minions).
 * - source is a carried artifact → its BEARER (the artifact's "here" is where the
 *   bearer stands, which may be far from the avatar).
 * - source is a ground artifact or a site → a positional pseudo-caster placed at
 *   the source's own square/region (sites anchor on their surface). This is
 *   UnitState-shaped only in the fields validateTarget reads (.x .y .region
 *   .controller); it is never inserted into state.
 *
 * BOTH the engine (game.ts) and the client (Game.tsx) call this so their
 * highlight/validation logic cannot drift.
 */
export function abilityAnchor(state: GameState, sourceId: string, player: PlayerId): UnitState {
  const unit = state.units[sourceId]
  if (unit) return unit
  const art = state.artifacts[sourceId]
  if (art) {
    if (art.carriedBy && state.units[art.carriedBy]) return state.units[art.carriedBy]
    return positionalCaster(art.x, art.y, art.region, player)
  }
  const site = state.sites[sourceId]
  if (site) return positionalCaster(site.x, site.y, 'surface', player)
  return avatarOf(state, player)
}

/** A throwaway UnitState-shaped object standing in for a non-unit ability source
 *  so validateTarget's `.x/.y/.region/.controller` reads resolve to that source's
 *  location. Never added to state. */
function positionalCaster(x: number, y: number, region: Region, player: PlayerId): UnitState {
  return {
    id: '__anchor__',
    cardId: '__anchor__',
    name: '__anchor__',
    owner: player,
    controller: player,
    isAvatar: false,
    x,
    y,
    region,
    tapped: false,
    damage: 0,
    enteredTurn: 0,
    modifiers: [],
    carrying: [],
    carryingUnits: [],
    usedThisTurn: {},
  }
}

export function sitesOf(state: GameState, player: PlayerId): SiteState[] {
  return Object.values(state.sites).filter((s) => s.controller === player)
}

/**
 * Two locations are in the same region iff their region tag matches.
 * "Adjacent/nearby locations" additionally require same region (rulebook).
 */
export function sameRegion(a: { region: Region }, b: { region: Region }): boolean {
  return a.region === b.region
}

export function stepKey(from: Step, to: Step): string {
  return `${from.x},${from.y},${from.region}->${to.x},${to.y},${to.region}`
}

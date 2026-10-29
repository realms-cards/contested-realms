import type { EffectAPI } from '../registry'
import { occupies } from '../../../engine/grid'
import { legalStepsFrom } from '../../../engine/movement'
import type { GameState, Region, Step, UnitState } from '../../../engine/types'

// "Take a step" / "may take a step" (Codex, Step, definition 2): the unit moves ITSELF, so it "may use
// abilities like Airborne, Voidwalk, Burrow, and Submerge, crossing region boundaries" — a diagonal
// step for Airborne, a Burrowed minion unburrowing at its own square (Leap Attack) — and "an Immobile
// unit could not 'take a step' at all". The steps come from legalStepsFrom (isLegalStep); the move
// itself goes through takeOwnStep (resolveMovement: walls, "enters here" triggers, carrier, animation).

type Square = { x: number; y: number }

const here = (u: UnitState): Step => ({ x: u.x, y: u.y, region: u.region })
const sameSq = (a: Square, b: Square) => a.x === b.x && a.y === b.y

/** The unit's legal own steps, ONE per square so a square answer (chooseSquare) is never ambiguous: at
 *  a neighbouring square its current region when that's legal, else the surface, else what it can
 *  reach; at its own square the vertical step (burrow, submerge, surface), if it has one. */
export function ownSteps(state: GameState, unit: UnitState): Step[] {
  const pref = (r: Region) => (r === unit.region ? 0 : r === 'surface' ? 1 : 2)
  const best = new Map<string, Step>()
  for (const s of legalStepsFrom(state, unit, here(unit))) {
    const k = `${s.x},${s.y}`
    const cur = best.get(k)
    if (!cur || pref(s.region) < pref(cur.region)) best.set(k, s)
  }
  return [...best.values()]
}

/** the own step onto `sq`, re-derived now (the board may have changed while a question waited) */
export function ownStepTo(state: GameState, unit: UnitState, sq: Square | null | undefined): Step | undefined {
  if (!sq || typeof sq.x !== 'number' || typeof sq.y !== 'number') return undefined
  return ownSteps(state, unit).find((s) => sameSq(s, sq))
}

/** The squares for a "MAY take a step" prompt: every own step, plus its own square to stay. */
export function mayStepSquares(state: GameState, unit: UnitState): Square[] {
  const out: Square[] = ownSteps(state, unit).map((s) => ({ x: s.x, y: s.y }))
  if (!out.some((s) => sameSq(s, unit))) out.push({ x: unit.x, y: unit.y })
  return out
}

export const STAY = 'Stay'
const verticalLabel = (to: Region) =>
  to === 'surface' ? 'Rise to the surface' : to === 'underground' ? 'Burrow' : to === 'underwater' ? 'Submerge' : 'Step'

/** Read the answer to a "may take a step" square prompt: the step to take, or 'stay'. Its own square
 *  means stay — unless it could also step vertically there (a Burrowed minion surfacing), in which case
 *  this asks which on `cont` (answered through mayStepOption) and returns 'asked'. */
export function readMayStep(ctx: EffectAPI, unit: UnitState, sq: Square | null | undefined, cont: string, contCtx: Record<string, unknown> = {}): Step | 'stay' | 'asked' {
  if (!sq || typeof sq.x !== 'number' || typeof sq.y !== 'number') return 'stay'
  const step = ownStepTo(ctx.state, unit, sq)
  if (!sameSq(sq, unit)) return step ?? 'stay'
  if (!step) return 'stay'
  ctx.ask({ kind: 'chooseOption', title: `${unit.name} — stay, or step ${step.region === 'surface' ? 'up' : 'down'}?`, data: { options: [STAY, verticalLabel(step.region)] } }, cont, contCtx)
  return 'asked'
}

/** the answer to readMayStep's stay-or-vertical question: the vertical step, or 'stay' */
export function mayStepOption(state: GameState, unit: UnitState, choice: unknown): Step | 'stay' {
  if (choice === STAY || typeof choice !== 'string') return 'stay'
  const step = ownSteps(state, unit).find((s) => sameSq(s, unit))
  return step && verticalLabel(step.region) === choice ? step : 'stay'
}

/** Own-step distance from the unit's location to every location it could reach with UNLIMITED movement,
 *  and the first steps that start a shortest route there (Codex, Closest: "imagine the Persecutor had
 *  unlimited movement and then ask: Are there any Evil units in Persecutor's range of motion? … the
 *  'closest' Evil is the unit that requires the fewest Persecutor steps to reach"). Keyed x,y,region. */
function ownStepRoutes(state: GameState, unit: UnitState): Map<string, { at: Step; dist: number; first: Step[] }> {
  const key = (s: Step) => `${s.x},${s.y},${s.region}`
  const start = here(unit)
  const out = new Map<string, { at: Step; dist: number; first: Step[] }>([[key(start), { at: start, dist: 0, first: [] }]])
  let frontier = [start]
  for (let dist = 1; frontier.length; dist++) {
    const next: Step[] = []
    for (const from of frontier) {
      const via = out.get(key(from))!
      for (const to of legalStepsFrom(state, unit, from)) {
        const firsts = dist === 1 ? [to] : via.first
        const seen = out.get(key(to))
        if (!seen) {
          out.set(key(to), { at: to, dist, first: [...firsts] })
          next.push(to)
        } else if (seen.dist === dist) {
          for (const f of firsts) if (!seen.first.some((g) => key(g) === key(f))) seen.first.push(f)
        }
      }
    }
    frontier = next
  }
  return out
}

/** "Step toward the closest X" measured in the unit's own steps (range of motion): the first steps
 *  that bring it closer to any of the equally-closest `targets` it can reach at all — one per square
 *  (its current region, else the surface), for a chooseSquare. Empty when no target is in its range of
 *  motion, or when one already shares its location. */
export function stepsTowardClosest(state: GameState, unit: UnitState, targets: UnitState[]): Step[] {
  const routes = ownStepRoutes(state, unit)
  const distTo = (t: UnitState) => {
    let d = Infinity
    for (const r of routes.values()) if (r.dist < d && occupies(t, r.at.x, r.at.y, r.at.region)) d = r.dist
    return d
  }
  const dists = targets.map(distTo)
  const min = Math.min(...dists)
  if (!Number.isFinite(min) || min === 0) return []
  const firsts: Step[] = []
  for (let i = 0; i < targets.length; i++) {
    if (dists[i] !== min) continue
    for (const r of routes.values()) {
      if (r.dist === min && occupies(targets[i], r.at.x, r.at.y, r.at.region)) firsts.push(...r.first)
    }
  }
  const pref = (r: Region) => (r === unit.region ? 0 : r === 'surface' ? 1 : 2)
  const best = new Map<string, Step>()
  for (const s of firsts) {
    const k = `${s.x},${s.y}`
    const cur = best.get(k)
    if (!cur || pref(s.region) < pref(cur.region)) best.set(k, s)
  }
  return [...best.values()]
}

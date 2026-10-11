import { type TargetRef } from '../registry'
import { occupiedSquares, GRID_W, GRID_H } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import type { GameState, UnitState, SiteState } from '../../../engine/types'

// Engine-authoritative legal-target sets for "up to N steps away" cards (CardScript.targetOptions).
// Distance is the REAL step distance (realStepDistanceW): one orthogonal step per adjacent location,
// routing AROUND the void and wrapping the Magellan seam — so a target with a void between it and the
// caster is correctly farther than its Manhattan distance (or unreachable), never "2 steps away". It is
// measured from the NEAREST body square, so an oversized / Rack-stretched caster (which later picks a
// firing origin among its squares) reaches anything ≤N real steps from ANY part of it. The client
// highlights exactly the returned set and castSpell / activateAbility reject anything outside it.

/** every in-bounds square within `maxSteps` REAL steps of the caster (nearest body square). */
export function squaresWithinSteps(state: GameState, caster: UnitState, maxSteps: number): TargetRef[] {
  const bodies = occupiedSquares(caster)
  const out: TargetRef[] = []
  for (let x = 0; x < GRID_W; x++)
    for (let y = 0; y < GRID_H; y++)
      if (bodies.some((b) => realStepDistanceW(state, b, { x, y }) <= maxSteps)) out.push({ square: { x, y } })
  return out
}

/** every site within `maxSteps` REAL steps of the caster (nearest body square), optionally narrowed by
 *  `ok` (e.g. Boil's water-site rule) so the returned set is the FULLY legal one. */
export function sitesWithinSteps(
  state: GameState,
  caster: UnitState,
  maxSteps: number,
  ok?: (site: SiteState) => boolean,
): TargetRef[] {
  const bodies = occupiedSquares(caster)
  const out: TargetRef[] = []
  for (const s of Object.values(state.sites)) {
    if (!bodies.some((b) => realStepDistanceW(state, b, s) <= maxSteps)) continue
    if (ok && !ok(s)) continue
    out.push({ site: s.id })
  }
  return out
}

import { type TargetSpec, type EffectAPI } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'
import type { UnitState } from '../../../engine/types'

// Shared target shape for "an ally vs. a target enemy it is adjacent to" spells (Duel, Joust!).
// "an ally" / "target enemy" (not "minion") — both may be Avatars.
export function adjacentFightTargets(allyLabel: string): TargetSpec[] {
  return [
    { what: 'unit', count: 1, targeted: false, owner: 'ally', label: allyLabel },
    { what: 'unit', count: 1, targeted: true, owner: 'enemy', label: 'target adjacent enemy' },
  ]
}

// Resolve the two chosen units and verify they are orthogonally/diagonally adjacent in the same region.
// Returns null (→ the card logs "Not adjacent.") when the pick is malformed or they are not adjacent.
export function resolveAdjacentCombatants(ctx: EffectAPI): { a: UnitState; b: UnitState } | null {
  const [t1, t2] = ctx.targets
  if (!t1 || !t2 || !('unit' in t1) || !('unit' in t2)) return null
  const a = ctx.state.units[t1.unit]
  const b = ctx.state.units[t2.unit]
  if (!a || !b) return null
  if (!adjacentSquaresW(ctx.state, a.x, a.y).some((s) => s.x === b.x && s.y === b.y) || a.region !== b.region) return null
  return { a, b }
}

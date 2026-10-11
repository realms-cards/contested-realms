import { type EffectAPI } from '../registry'
import { trySubmerge } from '../../../engine/effects'
import type { UnitState } from '../../../engine/types'

export function submergeOrDrown(ctx: EffectAPI, u: UnitState): void {
  trySubmerge(ctx.state, u)
}

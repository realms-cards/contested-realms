import { type EffectAPI } from '../registry'
import type { UnitState } from '../../../engine/types'

/** one-way strike helper honoring lethal */
export function strikeOnce(ctx: EffectAPI, striker: UnitState, targetId: string) {
  ctx.strike(striker, { unit: targetId })
}

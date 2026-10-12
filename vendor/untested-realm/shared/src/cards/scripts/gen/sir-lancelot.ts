import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { UnitState } from '../../../engine/types'

// 'Lance / The first time Sir Lancelot fights each turn, untap him.'
registerScript('Sir Lancelot', {
  afterAttack: (ctx, attacker) => lancelotSecondWind(ctx, attacker),
  onSelfStruck: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) lancelotSecondWind(ctx, self)
  },
})

function lancelotSecondWind(ctx: EffectAPI, self: UnitState): void {
  if (self.counters?.fought === ctx.state.turn) return
  self.counters = { ...self.counters, fought: ctx.state.turn }
  self.tapped = false
  pushLog(ctx.state, self.controller, 'Sir Lancelot fights on, untired.')
}

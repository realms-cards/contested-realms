import { registerScript, type EffectAPI } from '../registry'
import { pushLog, untapUnit } from '../../../engine/effects'
import type { UnitState } from '../../../engine/types'

// 'Lance / The first time Sir Lancelot fights each turn, untap him.'
registerScript('Sir Lancelot', {
  // any fight he is in — attacking, or defending even if never struck (an undefended site strike is a
  // strike, not a fight, and a Ranged shot hitting him isn't one either)
  onSelfFights: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) lancelotSecondWind(ctx, self)
  },
})

function lancelotSecondWind(ctx: EffectAPI, self: UnitState): void {
  if (self.counters?.fought === ctx.state.turn) return
  self.counters = { ...self.counters, fought: ctx.state.turn }
  untapUnit(ctx.state, self)
  pushLog(ctx.state, self.controller, 'Sir Lancelot fights on, untired.')
}

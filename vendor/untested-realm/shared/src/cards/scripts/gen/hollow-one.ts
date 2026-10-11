import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'

// 'Disabled until a Mortal or Beast dies nearby.'
registerScript('Hollow One', {
  selfDisabled: (state, self) => !self.counters?.awakened,
  onAnyDeath: (ctx, dead) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.counters?.awakened) return
    const st = effSubtypes(ctx.state, dead)
    if ((st.includes('Mortal') || st.includes('Beast')) && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === dead.x && s.y === dead.y)) {
      self.counters = { ...self.counters, awakened: 1 }
      pushLog(ctx.state, ctx.controller, 'The Hollow One awakens!')
    }
  },
})

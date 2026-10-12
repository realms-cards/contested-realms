import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, if no enemies are nearby, this gains Stealth.'
registerScript('Survivors of Serava', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.stealth) return
    const danger = nearbySquaresW(ctx.state, self.x, self.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .some((u) => u.controller !== ctx.controller)
    if (!danger) {
      self.stealth = true
      pushLog(ctx.state, ctx.controller, 'The Survivors go to ground.')
    }
  },
})

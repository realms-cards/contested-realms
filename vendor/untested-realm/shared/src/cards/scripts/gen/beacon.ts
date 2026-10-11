import { registerScript } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Gain (1) for each nearby site with an enemy atop it.'
registerScript('Beacon', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    let n = 0
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && unitsAt(ctx.state, sq.x, sq.y, 'surface').some((u) => u.controller !== ctx.controller)) n++
    }
    if (n > 0) {
      ctx.state.players[ctx.controller].mana += n
      pushLog(ctx.state, ctx.controller, `The Beacon blazes: +${n} mana this turn.`)
    }
  },
})

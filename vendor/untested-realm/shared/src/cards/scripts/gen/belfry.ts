import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'At the end of your turn, untap all nearby allies.' (artifact)
registerScript('Belfry', {
  endOfTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller === ctx.controller && nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === u.x && s.y === u.y)) u.tapped = false
    }
  },
})

import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Genesis → Each nearby Avatar heals 3 life.'
registerScript('Holy Ground', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    for (const u of Object.values(ctx.state.units)) {
      if (u.isAvatar && nearbySquaresW(ctx.state, self.x, self.y).some((sq) => sq.x === u.x && sq.y === u.y)) {
        ctx.gainLife(u.controller, 3)
      }
    }
  },
})

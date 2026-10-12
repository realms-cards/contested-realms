import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'At the end of your turn, each nearby Avatar discards a random card.'
registerScript('Court Jester', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const u of Object.values(ctx.state.units)) {
      if (u.isAvatar && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y)) {
        ctx.discardRandom(u.controller)
      }
    }
  },
})

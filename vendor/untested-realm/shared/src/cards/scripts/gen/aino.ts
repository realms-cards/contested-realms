import { registerScript } from '../registry'
import { GRID_H, siteAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'At the end of your turn, Aino may take a step between the top and bottom edges
// of the realm to gain Stealth.'
registerScript('Aino', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    if (self.y !== 0 && self.y !== GRID_H - 1) return
    const destY = self.y === 0 ? GRID_H - 1 : 0
    if (!siteAt(ctx.state, self.x, destY)) return
    ctx.ask({ kind: 'yesNo', title: 'Aino: slip across the realm and gain Stealth?' }, 'slip', { destY })
  },
  conts: {
    slip: (ctx, contCtx, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!choice || !self) return
      ctx.teleport(self.id, self.x, contCtx.destY, 'surface')
      if (ctx.state.units[self.id]) {
        self.stealth = true
        pushLog(ctx.state, ctx.controller, 'Aino vanishes across the water.')
      }
    },
  },
})

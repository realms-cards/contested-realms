import { registerScript } from '../registry'
import { terrainAt } from '../../../engine/statics'
import { checkStateBased } from '../../../engine/effects'

// 'Burrowing / At the end of your turn, Gneissgnath Gnomes may burrow.'
registerScript('Gneissgnath Gnomes', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || self.region !== 'surface') return
    if (terrainAt(ctx.state, self.x, self.y) !== 'land') return
    ctx.ask({ kind: 'yesNo', title: 'Gnomes: burrow for the night?' }, 'dig')
  },
  conts: {
    dig: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (choice && self && terrainAt(ctx.state, self.x, self.y) === 'land') {
        self.region = 'underground'
        checkStateBased(ctx.state)
      }
    },
  },
})

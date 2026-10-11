import { registerScript } from '../registry'
import { strikeAllSimultaneous } from '../../../engine/effects'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Deathrite → Strike each nearby enemy.'
registerScript('Sir Lamorak', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // nearby enemies are region-locked to the source; controller chooses the strike order
    const foes = nearbySquaresW(ctx.state, self.x, self.y)
      .flatMap((sq) => unitsAt(ctx.state, sq.x, sq.y, self.region))
      .filter((u) => u.controller !== ctx.controller)
      .map((u) => u.id)
    strikeAllSimultaneous(ctx.state, self.id, foes, ctx.controller)
  },
})

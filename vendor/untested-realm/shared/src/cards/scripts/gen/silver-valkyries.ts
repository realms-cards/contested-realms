import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'At the end of your turn, untap all allies here.'
registerScript('Silver Valkyries', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // "allies here" = the Valkyries' own location (their region), not a burrowed/submerged ally below them
    for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) {
      if (u.controller === ctx.controller) u.tapped = false
    }
  },
})

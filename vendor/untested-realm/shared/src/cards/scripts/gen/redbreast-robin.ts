import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'At the end of your turn, each other unit here takes 1 damage.'
registerScript('Redbreast Robin', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) {
      if (u.id !== self.id) ctx.dealDamage({ unit: u.id }, 1)
    }
  },
})

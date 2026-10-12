import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// 'This costs (2) less to cast for each minion you sacrifice at its summoning location.'
// (sacrifices are made voluntarily before casting; we count allied minions at the
// square and let the genesis consume them — closest faithful automation)
registerScript('Gnarled Wendigo', {
  selfCostModifier: (state, player, at) => {
    if (!at) return 0
    const meals = unitsAt(state, at.x, at.y, 'surface').filter((u) => u.controller === player && !u.isAvatar)
    return -2 * meals.length
  },
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) {
      if (u.id !== self.id && !u.isAvatar && u.controller === ctx.controller) ctx.kill(u.id)
    }
  },
})

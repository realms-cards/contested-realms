import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// ---------- simple triggers ----------

// 'Deathrite → Deal 3 damage to each unit here.'
registerScript('Sacred Scarabs', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) {
      if (u.id !== self.id) ctx.dealDamage({ unit: u.id }, 3)
    }
  },
})

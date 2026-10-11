import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Genesis → Deal 1 damage to each other nearby unit.'
registerScript('Flayer', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) {
        if (u.id !== self.id) ctx.dealDamage({ unit: u.id }, 1)
      }
    }
  },
})

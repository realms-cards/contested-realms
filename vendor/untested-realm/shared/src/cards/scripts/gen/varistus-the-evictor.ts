import { registerScript } from '../registry'
import { killUnit, checkStateBased } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Whenever Varistus enters a void location, he kills all enemies there.'
registerScript('Varistus the Evictor', {
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId || moved.region !== 'void') return
    for (const u of unitsAt(ctx.state, moved.x, moved.y, 'void')) {
      if (u.controller !== ctx.controller && !u.isAvatar) {
        killUnit(ctx.state, u.id)
      }
    }
    checkStateBased(ctx.state)
  },
})

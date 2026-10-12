import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Whenever Phase Assassin enters the void, he gains Stealth.'
registerScript('Phase Assassin', {
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId || moved.region !== 'void') return
    if (!moved.stealth) {
      moved.stealth = true
      pushLog(ctx.state, ctx.controller, 'Phase Assassin melts into the void.')
    }
  },
})

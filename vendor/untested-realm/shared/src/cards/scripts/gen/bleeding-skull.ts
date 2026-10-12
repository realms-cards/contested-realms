import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// 'Whenever a minion dies nearby, your opponent loses 1 life.'
registerScript('Bleeding Skull', {
  onAnyDeath: (ctx, dead) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || dead.isAvatar) return
    if (nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === dead.x && s.y === dead.y)) {
      ctx.loseLife((1 - ctx.controller) as PlayerId, 1)
    }
  },
})

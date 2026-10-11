import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Whenever a minion dies nearby, you heal 1.'
registerScript('Alabaster Box', {
  onAnyDeath: (ctx, dead) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || dead.isAvatar) return
    if (nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === dead.x && s.y === dead.y)) ctx.gainLife(ctx.controller, 1)
  },
})

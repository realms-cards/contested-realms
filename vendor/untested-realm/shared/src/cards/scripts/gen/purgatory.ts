import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Whenever an Evil minion dies nearby, its controller loses 1 life.'
registerScript('Purgatory', {
  onAnyDeath: (ctx, dead) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || dead.isAvatar || !isEvilU(ctx.state, dead)) return
    if (nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === dead.x && s.y === dead.y)) {
      ctx.loseLife(dead.controller, 1)
    }
  },
})

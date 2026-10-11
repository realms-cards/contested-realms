import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Whenever another site is played nearby, its controller loses 2 life.'
registerScript('Cursed Land', {
  onSitePlayed: (ctx, by, site) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || site.id === self.id) return
    if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === site.x && s.y === site.y)) return
    ctx.loseLife(by, 2)
    pushLog(ctx.state, by, 'The Cursed Land exacts its toll.')
  },
})

import { registerScript } from '../registry'
import { pushLog, loseLife } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// --------------------------------------------------------- Vindictive Nation ----
// 'Opponent loses 1, 3, or 7 life respectively if they modify, move, or
//  destroy a nearby allied site.'
registerScript('Vindictive Nation', {
  onSiteInterference: (ctx, kind, site, by) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || self.controller === null || by === null) return
    if (by === self.controller) return // only opponents pay the grudge
    if (site.controller !== self.controller) return // allied sites only
    if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === site.x && s.y === site.y)) return
    const price = kind === 'modify' ? 1 : kind === 'move' ? 3 : 7
    pushLog(ctx.state, by, `⚖️ The Vindictive Nation exacts its price: ${price} life for daring to ${kind} its land.`)
    loseLife(ctx.state, by, price)
  },
})

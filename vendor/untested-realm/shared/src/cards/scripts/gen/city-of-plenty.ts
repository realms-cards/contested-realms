import { registerScript } from '../registry'
import { cityActive } from '../multi-card-utils/city-threshold'

// '(W) — Provides (2) instead but also provides (1) for your opponent.'
registerScript('City of Plenty', {
  siteExtraManaFn: (state, siteId) => (cityActive(state, siteId, 'water') ? 1 : 0),
  startOfEachTurn: (ctx, activePlayer) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || self.controller === null || self.controller === activePlayer) return
    if (!cityActive(ctx.state, self.id, 'water')) return
    ctx.state.players[activePlayer].mana += 1
  },
})

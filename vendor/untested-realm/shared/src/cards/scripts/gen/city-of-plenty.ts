import { registerScript } from '../registry'

// '(W) — Provides (2) instead but also provides (1) for your opponent.'
registerScript('City of Plenty', {
  siteExtraMana: 1,
  startOfEachTurn: (ctx, activePlayer) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || self.controller === null || self.controller === activePlayer) return
    ctx.state.players[activePlayer].mana += 1
  },
})

import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { cityActive } from '../multi-card-utils/city-threshold'

// '(F) — Provides (2) instead but your opponent can cast minions to this site Stealthed.'
registerScript('City of Traitors', {
  siteExtraManaFn: (state, siteId) => (cityActive(state, siteId, 'fire') ? 1 : 0),
  siteAllowsAnySummon: (state, site) => cityActive(state, site.id, 'fire'),
  onUnitEnters: (ctx, entered) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || entered.isAvatar || entered.controller === self.controller) return
    if (!cityActive(ctx.state, self.id, 'fire')) return
    if (entered.x === self.x && entered.y === self.y && entered.enteredTurn === ctx.state.turn && !entered.stealth) {
      entered.stealth = true
      pushLog(ctx.state, entered.controller, `${entered.name} slips into the City of Traitors unseen.`)
    }
  },
})

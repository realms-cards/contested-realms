import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// '(F) — Provides (2) instead but your opponent can cast minions to this site Stealthed.'
registerScript('City of Traitors', {
  siteExtraMana: 1,
  siteAllowsAnySummon: true,
  onUnitEnters: (ctx, entered) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || entered.isAvatar || entered.controller === self.controller) return
    if (entered.x === self.x && entered.y === self.y && entered.enteredTurn === ctx.state.turn && !entered.stealth) {
      entered.stealth = true
      pushLog(ctx.state, entered.controller, `${entered.name} slips into the City of Traitors unseen.`)
    }
  },
})

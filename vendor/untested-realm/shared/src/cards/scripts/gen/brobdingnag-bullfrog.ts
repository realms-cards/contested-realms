import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Brobdingnag Bullfrog swallows another target minion here. He
//  carries it disabled in his belly until he leaves the realm.'
registerScript('Brobdingnag Bullfrog', {
  carriedAreDisabled: true,
  carriedCantDrop: true, // swallowed — only freed when the Bullfrog leaves the realm
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'here', label: 'another minion here',
  }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('unit' in t) || t.unit === self.id) return
    const meal = ctx.state.units[t.unit]
    if (!meal || meal.x !== self.x || meal.y !== self.y) return
    meal.carriedBy = self.id
    self.carryingUnits = [...(self.carryingUnits ?? []), meal.id]
    pushLog(ctx.state, ctx.controller, `GULP. ${meal.name} vanishes into the Bullfrog's belly.`)
  },
})

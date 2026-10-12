import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'At the end of your turn, deal 2 damage to this site.'
registerScript('Corruptor Freak', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const site = siteAt(ctx.state, self.x, self.y)
    if (site) ctx.dealDamage({ site: site.id }, 2)
  },
})

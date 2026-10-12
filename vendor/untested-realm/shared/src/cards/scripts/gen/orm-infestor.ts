import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Burrowing, Submerge / At the end of your turn, deal 1 damage to this site and you heal 1.'
registerScript('Orm Infestor', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const site = siteAt(ctx.state, self.x, self.y)
    if (site) ctx.dealDamage({ site: site.id }, 1)
    ctx.gainLife(ctx.controller, 1)
  },
})

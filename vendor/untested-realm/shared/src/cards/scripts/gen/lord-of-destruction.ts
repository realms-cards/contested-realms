import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { killUnit } from '../../../engine/effects'

// 'Destroys sites it strikes and other minions there.'
registerScript('Lord of Destruction', {
  onStrikeSite: (ctx, siteId) => {
    const site = ctx.state.sites[siteId]
    if (!site) return
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (!u.isAvatar && u.id !== ctx.sourceId) killUnit(ctx.state, u.id)
    }
    ctx.destroySite(siteId)
  },
})

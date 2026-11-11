import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { killUnit, checkWard, pushLog } from '../../../engine/effects'

// 'Destroys sites it strikes and other minions there.'
registerScript('Lord of Destruction', {
  onStrikeSite: (ctx, siteId) => {
    const site = ctx.state.sites[siteId]
    if (!site) return
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (u.isAvatar || u.id === ctx.sourceId) continue
      // a Ward stops any destruction, even by your own card: it breaks instead (Codex Ward)
      if (checkWard(ctx.state, u, ctx.controller, u.controller, 'destroy')) {
        pushLog(ctx.state, ctx.controller, `${u.name}'s ward breaks.`)
        continue
      }
      killUnit(ctx.state, u.id)
    }
    ctx.destroySite(siteId)
  },
})

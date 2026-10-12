import { registerScript } from '../registry'
import { getCard } from '../../db'
import { waterSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { wardUnit } from '../../../engine/effects'

// 'Ward each allied minion at target water site.'
registerScript('Baptize', {
  targets: [{
    what: 'site', count: 1, targeted: true, label: 'target water site',
    filter: (state, site) => isWaterSite(state, site, getCard),
  }],
  targetOptions: (state) => waterSiteTargets(state), // engine-authoritative glow: every water site
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (!u.isAvatar && u.controller === ctx.controller) wardUnit(ctx.state, u)
    }
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { landSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { checkStateBased } from '../../../engine/effects'

// 'Unburrow everything at target land site and summon two Skeleton tokens there.'
registerScript('Exhume', {
  targets: [{
    what: 'site', count: 1, targeted: true, label: 'target land site',
    filter: (state, site) => !isWaterSite(state, site, getCard),
  }],
  targetOptions: (state) => landSiteTargets(state), // engine-authoritative glow: every land site
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return
    for (const u of unitsAt(ctx.state, site.x, site.y, 'underground')) u.region = 'surface'
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.x === site.x && a.y === site.y && a.region === 'underground') a.region = 'surface'
    }
    ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
    ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
    checkStateBased(ctx.state)
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { waterSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { pushLog, checkStateBased, trySubmerge } from '../../../engine/effects'
import { syncCarried, buryArtifactsAt } from '../../../engine/carrying'

// 'Submerge all minions and artifacts occupying target water site.' (the water-site mirror of Cave-In)
registerScript('Stormy Seas', {
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
    for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) {
      // trySubmerge applies the footprint / protection / drowning rules (avatars and mixed-terrain
      // oversized units can't submerge); a survivor takes its cargo down with it
      if (trySubmerge(ctx.state, u) && ctx.state.units[u.id]) syncCarried(ctx.state, u)
    }
    // every artifact occupying the site is submerged — loose ones AND ones carried by a unit that
    // couldn't submerge (an Avatar, a straddling oversized unit), which are detached and submerged too
    buryArtifactsAt(ctx.state, site.x, site.y, 'underwater')
    pushLog(ctx.state, ctx.controller, 'The seas swallow everything!')
    checkStateBased(ctx.state)
  },
})

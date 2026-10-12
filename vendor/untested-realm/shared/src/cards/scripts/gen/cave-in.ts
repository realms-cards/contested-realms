import { registerScript } from '../registry'
import { getCard } from '../../db'
import { landSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { footprintAllTerrain } from '../../../engine/statics'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { syncCarried, buryArtifactsAt } from '../../../engine/carrying'

// 'Burrow all minions and artifacts occupying target land site.'
registerScript('Cave-In', {
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
    for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) {
      // an oversized unit straddling non-land squares can't be buried (rulebook)
      if (!u.isAvatar && footprintAllTerrain(ctx.state, u, 'land')) { u.region = 'underground'; syncCarried(ctx.state, u) }
    }
    // every artifact occupying the site is buried — loose ones AND ones carried by a unit that
    // couldn't be buried (an Avatar, a straddling oversized unit), which are detached and buried too
    buryArtifactsAt(ctx.state, site.x, site.y)
    pushLog(ctx.state, ctx.controller, 'The earth swallows everything!')
    checkStateBased(ctx.state)
  },
})

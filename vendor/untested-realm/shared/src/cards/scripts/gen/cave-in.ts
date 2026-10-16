import { registerScript } from '../registry'
import { getCard } from '../../db'
import { landSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { burrowOccupantsAt } from '../multi-card-utils/burrow-occupants'
import { isWaterSite } from '../../../engine/grid'
import { pushLog, checkStateBased } from '../../../engine/effects'

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
    burrowOccupantsAt(ctx.state, site.x, site.y)
    pushLog(ctx.state, ctx.controller, 'The earth swallows everything!')
    checkStateBased(ctx.state)
  },
})

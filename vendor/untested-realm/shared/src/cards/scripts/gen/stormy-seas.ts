import { registerScript } from '../registry'
import { getCard } from '../../db'
import { waterSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { isWaterSite } from '../../../engine/grid'
import { pushLog, checkStateBased } from '../../../engine/effects'
import { submergeOccupantsAt } from '../multi-card-utils/burrow-occupants'

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
    // minions (via trySubmerge, cargo included) and every artifact here, carried or not
    submergeOccupantsAt(ctx.state, site.x, site.y)
    pushLog(ctx.state, ctx.controller, 'The seas swallow everything!')
    checkStateBased(ctx.state)
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { waterSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { adjacentSquaresW, isWaterSite, unitsAt } from '../../../engine/grid'
import { isLegalStep } from '../../../engine/movement'
import { pushLog, checkStateBased, emitUnitMoved } from '../../../engine/effects'

// 'Minions adjacent to target Water site step towards it. Then submerge all minions there.'
registerScript('Call of the Sea', {
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
    for (const sq of adjacentSquaresW(ctx.state, site.x, site.y)) {
      if (sq.x === site.x && sq.y === site.y) continue
      for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) {
        if (u.isAvatar) continue
        const from = { x: u.x, y: u.y, region: u.region }
        const to = { x: site.x, y: site.y, region: 'surface' as const }
        // "step towards it" is a STEP — a unit that can't take it (Immobile, a wall in the way, an entry
        // ban like Great Wall, a diagonal without Airborne) simply doesn't move.
        if (!isLegalStep(ctx.state, u, from, to)) continue
        u.x = site.x
        u.y = site.y
        emitUnitMoved(ctx.state, u, from) // a forced move onto the site "enters" it (Druid thorns, etc.)
      }
    }
    for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) {
      if (!u.isAvatar) u.region = 'underwater'
    }
    pushLog(ctx.state, ctx.controller, 'The sea calls them down.')
    checkStateBased(ctx.state)
  },
})

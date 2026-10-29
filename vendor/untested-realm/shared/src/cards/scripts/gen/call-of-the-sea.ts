import { registerScript } from '../registry'
import { getCard } from '../../db'
import { waterSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { adjacentSquaresW, isWaterSite, unitsAt } from '../../../engine/grid'
import { isLegalStep, takeOwnStep } from '../../../engine/movement'
import { pushLog, checkStateBased, trySubmerge } from '../../../engine/effects'

// 'Minions adjacent to target Water site step towards it. Then submerge all minions there.'
// "Step towards it" is each minion's own step (Codex, Step def. 2: takeOwnStep), which Old Salt Anchorman
// doesn't stop (FAQ). "Submerge" forces them under (trySubmerge: forced movement, so "can't be moved by
// force", an enemy's Anchorman and the submerge wards apply, and a minion that can't live there drowns).
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
        if (u.isAvatar || !ctx.state.units[u.id] || u.x !== sq.x || u.y !== sq.y) continue // gone, or already stepped
        const from = { x: u.x, y: u.y, region: u.region }
        const to = { x: site.x, y: site.y, region: 'surface' as const }
        // "step towards it" is a STEP — a unit that can't take it (Immobile, a wall in the way, an entry
        // ban like Great Wall, a diagonal without Airborne) simply doesn't move.
        if (!isLegalStep(ctx.state, u, from, to)) continue
        takeOwnStep(ctx.state, u, to)
      }
    }
    for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) {
      if (!u.isAvatar && ctx.state.units[u.id]) trySubmerge(ctx.state, u, ctx.controller)
    }
    pushLog(ctx.state, ctx.controller, 'The sea calls them down.')
    checkStateBased(ctx.state)
  },
})

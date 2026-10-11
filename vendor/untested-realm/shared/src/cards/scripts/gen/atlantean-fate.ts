import { registerScript } from '../registry'
import { pushLog, trySubmerge, applyFlood } from '../../../engine/effects'
import { siteAt, unitsAt } from '../../../engine/grid'
import { siteRarity } from '../../../engine/statics'

// 'Affected non-Ordinary sites are flooded. They are water sites, only provide
//  Water threshold, and lose all other abilities. / Genesis → Submerge all
//  minions and artifacts atop affected sites.'
registerScript('Atlantean Fate', {
  // only NON-Ordinary sites are "affected" — an Ordinary site in the area is untouched (NOT silenced,
  // not water-limited). Rubble is Ordinary, so it's spared too (siteRarity).
  auraSilencesSites: (state, site) => siteRarity(state, site) !== 'Ordinary',
  auraLimitsToWaterThreshold: true,
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    for (const sq of aura.squares) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && siteRarity(ctx.state, site) !== 'Ordinary') applyFlood(ctx.state, site, ctx.controller)
      for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) trySubmerge(ctx.state, u)
      for (const a of Object.values(ctx.state.artifacts)) {
        if (!a.carriedBy && a.x === sq.x && a.y === sq.y && a.region === 'surface') a.region = 'underwater'
      }
    }
    pushLog(ctx.state, null, 'The fate of Atlantis comes for these lands.')
  },
})

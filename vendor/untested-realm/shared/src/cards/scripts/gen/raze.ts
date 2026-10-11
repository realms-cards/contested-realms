import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { isArtifactUnit } from '../../../engine/statics'

// 'An ally destroys its site and all artifacts there.'
registerScript('Raze', {
  // "an ally" (not "an allied minion") — so it may target your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const ally = ctx.state.units[t.unit]
    if (!ally) return
    const site = siteAt(ctx.state, ally.x, ally.y)
    if (!site) return ctx.log('No site beneath them to raze.')
    for (const u2 of unitsAt(ctx.state, site.x, site.y)) {
      if (isArtifactUnit(ctx.state, u2)) ctx.kill(u2.id) // automatons are artifacts
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (!a.carriedBy && a.x === site.x && a.y === site.y) ctx.breakArtifact(a.id)
    }
    ctx.destroySite(site.id)
  },
})

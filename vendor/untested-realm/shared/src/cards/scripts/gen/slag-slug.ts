import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'

// 'Whenever the Slug leaves a site, it deals 2 damage to units there.'
// Any way it leaves — its own step, a push or drag (once per square it passes through), a teleport. Moving
// between a site's surface and its subsurface doesn't leave the site (Codex, Enter). "There" is the site
// it left, both its surface and its subsurface (Codex, Here). Leaving the realm isn't leaving a site.
registerScript('Slag Slug', {
  onUnitEntersSquare: (ctx, moved, from) => {
    if (moved.id !== ctx.sourceId) return
    if (moved.x === from.x && moved.y === from.y) return
    const site = siteAt(ctx.state, from.x, from.y)
    if (!site) return
    const victims = unitsAt(ctx.state, from.x, from.y).filter((u) => u.id !== moved.id)
    if (!victims.length) return
    ctx.log(`${moved.name} leaves a trail of molten slag at ${site.name}.`)
    for (const u of victims) ctx.dealDamage({ unit: u.id }, 2)
  },
})

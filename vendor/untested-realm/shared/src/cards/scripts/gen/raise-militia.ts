import { registerScript } from '../registry'
import { siteAt, orthAdjacentWrapped } from '../../../engine/grid'

// 'Summon a Skeleton token to each allied site that borders an enemy site.'
registerScript('Raise Militia', {
  onCast: (ctx) => {
    for (const site of Object.values(ctx.state.sites)) {
      if (site.controller !== ctx.controller || site.isRubble) continue
      // "borders" is Magellan-aware: a site across the joined edge counts
      const borders = orthAdjacentWrapped(ctx.state, site.x, site.y)
        .some((s) => {
          const o = siteAt(ctx.state, s.x, s.y)
          return o && o.controller !== null && o.controller !== ctx.controller && !o.isRubble
        })
      if (borders) ctx.summonToken('Skeleton', ctx.controller, site.x, site.y)
    }
  },
})

import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt, sitesOf } from '../../../engine/grid'

// 'Summon a Foot Soldier token to each site you control that borders an enemy site.'
registerScript('Border Militia', {
  onCast: (ctx) => {
    for (const site of sitesOf(ctx.state, ctx.controller)) {
      const borders = adjacentSquaresW(ctx.state, site.x, site.y).some((s) => {
        if (s.x === site.x && s.y === site.y) return false
        const other = siteAt(ctx.state, s.x, s.y)
        return !!other && other.controller !== null && other.controller !== ctx.controller
      })
      if (borders) ctx.summonToken('Foot Soldier', ctx.controller, site.x, site.y)
    }
  },
})

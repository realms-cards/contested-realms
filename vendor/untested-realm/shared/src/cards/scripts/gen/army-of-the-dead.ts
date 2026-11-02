import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Whenever this Army moves or takes damage, it leaves a Skeleton token behind.'
registerScript('Army of the Dead', {
  onUnitEntersSquare: (ctx, moved, from) => {
    if (moved.id !== ctx.sourceId) return
    // left behind where it was — underground/underwater too (only the void, with no site, holds none)
    if (from.region !== 'void' && siteAt(ctx.state, from.x, from.y)) {
      ctx.summonToken('Skeleton', ctx.controller, from.x, from.y, from.region)
    }
  },
  onSelfDamaged: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self && siteAt(ctx.state, self.x, self.y)) ctx.summonToken('Skeleton', ctx.controller, self.x, self.y, self.region)
  },
})

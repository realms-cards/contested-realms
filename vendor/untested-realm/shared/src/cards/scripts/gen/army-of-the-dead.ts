import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Whenever this Army moves or takes damage, it leaves a Skeleton token behind.'
registerScript('Army of the Dead', {
  onUnitEntersSquare: (ctx, moved, from) => {
    if (moved.id !== ctx.sourceId) return
    if (from.region === 'surface' && siteAt(ctx.state, from.x, from.y)) {
      ctx.summonToken('Skeleton', ctx.controller, from.x, from.y)
    }
  },
  onSelfDamaged: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self && siteAt(ctx.state, self.x, self.y)) ctx.summonToken('Skeleton', ctx.controller, self.x, self.y)
  },
})

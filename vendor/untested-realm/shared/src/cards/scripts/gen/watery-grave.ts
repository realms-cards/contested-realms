import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Whenever an enemy drowns nearby, summon a Skeleton token atop that site.'
registerScript('Watery Grave', {
  onDrowned: (ctx, victim) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || victim.controller === ctx.controller) return
    if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === victim.x && s.y === victim.y)) return
    if (siteAt(ctx.state, victim.x, victim.y)) {
      ctx.summonToken('Skeleton', ctx.controller, victim.x, victim.y)
      pushLog(ctx.state, ctx.controller, 'The drowned rise in service of the Watery Grave.')
    }
  },
})

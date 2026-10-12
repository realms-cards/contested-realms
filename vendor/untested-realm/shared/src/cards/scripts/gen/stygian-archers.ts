import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Whenever Stygian Archers kill an enemy, summon a Skeleton token where it died.'
registerScript('Stygian Archers', {
  onKill: (ctx, victim) => {
    if (siteAt(ctx.state, victim.x, victim.y)) {
      ctx.summonToken('Skeleton', ctx.controller, victim.x, victim.y)
      pushLog(ctx.state, ctx.controller, 'The fallen rises again, fletched with stygian arrows.')
    }
  },
})

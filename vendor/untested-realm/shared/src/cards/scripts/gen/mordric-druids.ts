import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Whenever you lose life due to an undefended attack nearby, the attacker's
//  controller also loses that much life.'
registerScript('Mordric Druids', {
  onLifeLost: (ctx, player, amount, source) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || player !== ctx.controller || !source || source.kind !== 'strike' || !source.undefended) return
    const attacker = source.attackerId ? ctx.state.units[source.attackerId] : null
    if (!attacker) return
    if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === attacker.x && s.y === attacker.y)) return
    ctx.loseLife(attacker.controller, amount)
    pushLog(ctx.state, ctx.controller, `The Mordric Druids return the pain (${amount}).`)
  },
})

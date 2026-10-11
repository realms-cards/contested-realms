import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'If a nearby allied minion survives damage, fully heal it.'
registerScript('Sawbones', {
  onUnitDamaged: (ctx, victim) => {
    const self = ctx.state.units[ctx.sourceId]
    const alive = ctx.state.units[victim.id]
    if (!self || !alive || alive.isAvatar || alive.controller !== ctx.controller || alive.id === self.id) return
    if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === alive.x && s.y === alive.y)) return
    if (alive.damage > 0) {
      alive.damage = 0
      pushLog(ctx.state, ctx.controller, `Sawbones patches ${alive.name} up good as new.`)
    }
  },
})

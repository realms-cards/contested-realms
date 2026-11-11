import { registerScript, type EffectAPI } from '../registry'
import { pushLog, deferUntilDamageSettled } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'If a nearby allied minion survives damage, fully heal it.'
// "Survives" is judged once the simultaneous damage has all landed (two defenders' strikes are ONE blow):
// inside a strike pass or a damage event the check waits, then runs after the deaths settle.
registerScript('Sawbones', {
  onUnitDamaged: (ctx, victim) => {
    if (deferUntilDamageSettled(ctx.state, ctx.sourceId, victim.id)) return
    patchUp(ctx, victim.id)
  },
  onDamageSettled: (ctx, victimId) => patchUp(ctx, victimId),
})

function patchUp(ctx: EffectAPI, victimId: string): void {
  const self = ctx.state.units[ctx.sourceId]
  const alive = ctx.state.units[victimId]
  if (!self || !alive || alive.isAvatar || alive.controller !== ctx.controller || alive.id === self.id) return
  if (!nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === alive.x && s.y === alive.y)) return
  if (alive.damage > 0) {
    alive.damage = 0
    pushLog(ctx.state, ctx.controller, `Sawbones patches ${alive.name} up good as new.`)
  }
}

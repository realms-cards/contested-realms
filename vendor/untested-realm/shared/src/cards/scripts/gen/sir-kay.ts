import { registerScript, type EffectAPI } from '../registry'
import type { UnitState } from '../../../engine/types'
import { pushLog, untapUnit } from '../../../engine/effects'
import { effAttack } from '../../../engine/statics'

// 'Whenever Sir Kay targets a weaker minion, he untaps.'
registerScript('Sir Kay', {
  onTargetsUnit: (ctx, target) => kayTargets(ctx, target),
  // the defender of an attack is targeted (rulebook: attacks target — Airborne, Stealth)
  onUnitAttacked: (ctx, target, attacker) => {
    if (attacker.id === ctx.sourceId) kayTargets(ctx, target)
  },
})

function kayTargets(ctx: EffectAPI, target: UnitState): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || target.isAvatar) return
  if (effAttack(ctx.state, target) < effAttack(ctx.state, self)) {
    untapUnit(ctx.state, self)
    pushLog(ctx.state, ctx.controller, 'Sir Kay scoffs at the effort and readies himself again.')
  }
}

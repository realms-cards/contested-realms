import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effAttack } from '../../../engine/statics'
import type { UnitState } from '../../../engine/types'

// 'Whenever Sir Pellinore kills the strongest enemy minion, draw a card.'
registerScript('Sir Pellinore', {
  onKill: (ctx, victim) => {
    if (victim.isAvatar) return
    const strongest = Math.max(
      effAttack(ctx.state, victim as UnitState),
      ...Object.values(ctx.state.units)
        .filter((u) => !u.isAvatar && u.controller === victim.controller)
        .map((u) => effAttack(ctx.state, u)),
    )
    if (effAttack(ctx.state, victim as UnitState) >= strongest) {
      ctx.drawCard(ctx.controller)
      pushLog(ctx.state, ctx.controller, 'The Questing King fells the mightiest — and learns from it.')
    }
  },
})

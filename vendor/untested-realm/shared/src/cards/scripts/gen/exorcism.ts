import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { effSubtypes } from '../../../engine/statics'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Banish all Demon and Undead minions at target location up to two steps away.'
registerScript('Exorcism', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  targetOptions: (state, caster) => squaresWithinSteps(state, caster, 2), // client-blockable range
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const c = ctx.caster!
    if (realStepDistanceW(ctx.state, c, t.square) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    const region = t.square.region ?? c.region
    for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
      const st = effSubtypes(ctx.state, u)
      if (!u.isAvatar && (st.includes('Demon') || st.includes('Undead'))) ctx.banish(u.id)
    }
  },
})

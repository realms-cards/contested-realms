import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Deal 3 damage to each unit at target location up to two steps away.'
registerScript('Minor Explosion', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  // engine-authoritative legal set: every square ≤2 steps away → the client can't click a far location
  // and castSpell rejects one (see step-range-targets).
  targetOptions: (state, caster) => squaresWithinSteps(state, caster, 2),
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const c = ctx.caster!
    // "up to two steps away" = step/Manhattan distance (def. 1), wrap-aware — NOT chebyshev, which
    // wrongly allowed diagonals-plus (e.g. caster c2 could hit d4, actually 3 steps).
    if (realStepDistanceW(ctx.state, c, t.square) > 2) return ctx.log('Too far away.')
    const region = t.square.region ?? c.region
    // Damage is simultaneous: the engine's open damage event defers every death until the whole spell
    // resolves, so an Ironclad avatar here with nearby Shield Maidens keeps the Maidens' −1 even when
    // the same 3 damage is lethal to the Maidens (no unit leaves the board mid-blast).
    for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
      ctx.dealDamage({ unit: u.id }, 3)
    }
  },
})

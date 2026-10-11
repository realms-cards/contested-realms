import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt, siteAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Tap → Target a location up to three steps away. Deal 4 damage to each unit there.
//  Deathrite → Summon a Foot Soldier token to each adjacent location.'
registerScript('Midland Army', {
  // bombard's legal set: every square ≤3 steps from Midland Army → the ability path highlights/permits
  // exactly these and rejects a too-far pick (so the tap isn't wasted on a dead shot).
  targetOptions: (state, caster) => squaresWithinSteps(state, caster, 3),
  abilities: [{
    key: 'bombard',
    label: 'Tap → Deal 4 damage to each unit at target location up to three steps away',
    cost: { tap: true },
    targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤3 steps)' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('square' in t)) return
      if (realStepDistanceW(ctx.state, self, t.square) > 3) return ctx.log('Too far away.') // "up to three steps away" (def. 1)
      const region = t.square.region ?? self.region
      for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
        ctx.dealDamage({ unit: u.id }, 4)
      }
    },
  }],
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const sq of adjacentSquaresW(ctx.state, self.x, self.y)) {
      // tokens can only exist atop sites; a siteless adjacent square yields nothing
      if (siteAt(ctx.state, sq.x, sq.y)) ctx.summonToken('Foot Soldier', ctx.controller, sq.x, sq.y)
    }
  },
})

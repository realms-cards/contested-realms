import { registerScript } from '../registry'
import { chebyshevW, unitsAt } from '../../../engine/grid'

// 'Airborne / Tap → Deal 4 damage to each other unit at target location nearby.'
registerScript('Ancient Dragon', {
  abilities: [{
    key: 'breath',
    label: 'Tap → 4 damage to each other unit at a nearby location',
    cost: { tap: true },
    // `where: 'nearby'` is carried on the spec so validateTarget constrains it on BOTH sides — the
    // client highlights only nearby squares, instead of the whole board with a fizzle on a far click.
    targets: [{ what: 'square', count: 1, targeted: true, where: 'nearby', label: 'target location nearby' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('square' in t)) return
      if (chebyshevW(ctx.state, self, t.square) > 1) return ctx.log('Too far.')
      for (const u of unitsAt(ctx.state, t.square.x, t.square.y, t.square.region ?? self.region)) {
        if (u.id !== self.id) ctx.dealDamage({ unit: u.id }, 4)
      }
    },
  }],
})

import { registerScript } from '../registry'
import { chebyshevW, unitsAt } from '../../../engine/grid'

// 'Airborne / Tap → Deal 3 damage to each other unit at target nearby location.
// Summon a Skeleton token there for each unit that died.'
registerScript('Draconian Bonekite', {
  abilities: [{
    key: 'reap',
    label: 'Tap → 3 damage at a nearby location, skeletons for the dead',
    cost: { tap: true },
    targets: [{ what: 'square', count: 1, targeted: true, where: 'nearby', label: 'target nearby location' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('square' in t)) return
      if (chebyshevW(ctx.state, self, t.square) > 1) return ctx.log('Too far.')
      const region = t.square.region ?? self.region
      // The 3 damage hits everyone at once (a simultaneous blast: no victim leaves the board until
      // every hit's reduction/prevention has resolved), THEN we settle and count who fell — a
      // Skeleton for each. settleDeaths collapses this blast's deaths so the count is accurate.
      const ids = unitsAt(ctx.state, t.square.x, t.square.y, region).filter((u) => u.id !== self.id).map((u) => u.id)
      for (const id of ids) if (ctx.state.units[id]) ctx.dealDamage({ unit: id }, 3)
      ctx.settleDeaths()
      const deaths = ids.filter((id) => !ctx.state.units[id]).length
      for (let i = 0; i < deaths; i++) ctx.summonToken('Skeleton', ctx.controller, t.square.x, t.square.y)
    },
  }],
})

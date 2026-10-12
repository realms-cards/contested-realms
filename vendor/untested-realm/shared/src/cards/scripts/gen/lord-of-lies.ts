import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { fightUnits } from '../../../engine/combat'

// 'Once on your turn, you may have two target units at a nearby location fight.'
registerScript('Lord of Lies', {
  abilities: [{
    key: 'whisper',
    label: 'Whisper lies (two units at a nearby location fight)',
    cost: {},
    oncePerTurn: true,
    targets: [
      // FAQ: Lord of Lies can't make ITSELF one of the two fighting units.
      { what: 'unit', count: 1, targeted: true, where: 'nearby', label: 'first unit', filter: (_s, c, self) => c.id !== self.id },
      { what: 'unit', count: 1, targeted: true, where: 'nearby', label: 'second unit (same location)', filter: (_s, c, self) => c.id !== self.id },
    ],
    effect: (ctx) => {
      const [t1, t2] = ctx.targets
      if (!('unit' in t1) || !('unit' in t2)) return
      const a = ctx.state.units[t1.unit]
      const b = ctx.state.units[t2.unit]
      if (!a || !b || a.id === b.id) return
      if (a.x !== b.x || a.y !== b.y || a.region !== b.region) return ctx.log('They are not at the same location.')
      pushLog(ctx.state, ctx.controller, `${a.name} and ${b.name} turn on each other!`)
      // a real fight: both strike simultaneously, firing every strike trigger (Interrogator's
      // "whenever an ally strikes an enemy Avatar", Lethal, kill triggers…) — not raw damage.
      fightUnits(ctx.state, a, b)
    },
  }],
})

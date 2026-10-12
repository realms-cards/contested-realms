import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'
import { effAttack } from '../../../engine/statics'

// 'Can pick up adjacent weaker enemy minions. They're disabled while carried.'
registerScript('Bodach Bogeyman', {
  carriedAreDisabled: true,
  abilities: [{
    key: 'snatch',
    label: 'Snatch an adjacent weaker enemy minion',
    cost: {},
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const prey = orthAdjacentWrapped(ctx.state, self.x, self.y)
        .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
        .filter((u) => !u.isAvatar && u.controller !== ctx.controller && !u.carriedBy && effAttack(ctx.state, u) < effAttack(ctx.state, self))
        .map((u) => u.id)
      if (!prey.length) return ctx.log('No weaker enemy within reach.')
      ctx.ask({ kind: 'chooseTargets', title: 'The Bogeyman stuffs whom into its sack?', data: { candidates: prey, count: 1, upTo: false, kind: 'unit' } }, 'snatch')
    },
  }],
  conts: {
    snatch: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const prey = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !prey) return
      prey.carriedBy = self.id
      prey.x = self.x
      prey.y = self.y
      prey.region = self.region
      self.carryingUnits = [...(self.carryingUnits ?? []), prey.id]
      pushLog(ctx.state, ctx.controller, `${prey.name} disappears into the Bogeyman's sack!`)
    },
  },
})

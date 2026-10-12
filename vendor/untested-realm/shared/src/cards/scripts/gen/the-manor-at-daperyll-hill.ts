import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'

// '(A)(A)(A)(A) — Once on your turn, this may deal 3 damage to target enemy
//  here to heal you 3.'
registerScript('The Manor at Daperyll Hill', {
  abilities: [{
    key: 'feast',
    label: '3 damage to an enemy here → heal 3',
    cost: {},
    threshold: { air: 4 },
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const prey = unitsAt(ctx.state, self.x, self.y).filter((u) => u.controller !== ctx.controller).map((u) => u.id)
      if (!prey.length) return ctx.log('No enemy dines at the Manor.')
      ctx.ask({ kind: 'chooseTargets', title: 'The Manor feeds on whom?', data: { candidates: prey, count: 1, upTo: false, kind: 'unit' } }, 'feast')
    },
  }],
  conts: {
    feast: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string' && ctx.state.units[id]) {
        ctx.dealDamage({ unit: id }, 3)
        ctx.gainLife(ctx.controller, 3)
      }
    },
  },
})

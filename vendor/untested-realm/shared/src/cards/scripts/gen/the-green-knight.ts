import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Whenever an enemy minion can attack The Green Knight, it must. /
//  Deathrite → Strike target nearby enemy.'
registerScript('The Green Knight', {
  enemiesMustAttackMe: true,
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const prey = nearbySquaresW(ctx.state, self.x, self.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => u.controller !== ctx.controller)
      .map((u) => u.id)
    if (!prey.length) return
    ctx.ask({ kind: 'chooseTargets', title: "The Green Knight's head laughs — and strikes whom?", data: { candidates: prey, count: 1, upTo: true, kind: 'unit' } }, 'beheaded')
  },
  conts: {
    beheaded: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (self && typeof id === 'string' && ctx.state.units[id]) ctx.strike(self, { unit: id })
    },
  },
})

import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'At the end of your turn, untap another nearby ally.'
registerScript('Sugarplum Pixies', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const tired = nearbySquaresW(ctx.state, self.x, self.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => u.id !== self.id && u.controller === ctx.controller && u.tapped)
      .map((u) => u.id)
    if (!tired.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Pixies refresh whom?', data: { candidates: tired, count: 1, upTo: true, kind: 'unit' } }, 'refresh')
  },
  conts: {
    refresh: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (u) u.tapped = false
    },
  },
})

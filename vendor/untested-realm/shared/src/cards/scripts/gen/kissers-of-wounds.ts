import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { wardUnit } from '../../../engine/effects'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Genesis → Ward a wounded minion nearby, or you heal 2.'
registerScript('Kissers of Wounds', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const wounded = nearbySquaresW(ctx.state, self.x, self.y)
      // nearby minion is region-locked to the source
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => !u.isAvatar && u.damage > 0 && !isEvilU(ctx.state, u))
      .map((u) => u.id)
    if (!wounded.length) return ctx.gainLife(ctx.controller, 2)
    ctx.ask({ kind: 'chooseTargets', title: 'Ward which wounded minion (skip to heal 2)?', data: { candidates: wounded, count: 1, upTo: true, kind: 'unit' } }, 'kiss')
  },
  conts: {
    kiss: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = id ? ctx.state.units[id] : null
      if (u) wardUnit(ctx.state, u)
      else ctx.gainLife(ctx.controller, 2)
    },
  },
})

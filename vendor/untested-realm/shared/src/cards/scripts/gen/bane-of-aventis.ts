import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { takeControl } from '../multi-card-utils/take-control'

// 'Genesis → Gain control of nearby Warded minions.'
registerScript('Bane of Aventis', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, self.region)) {
        if (!u.isAvatar && u.ward && u.controller !== ctx.controller) takeControl(ctx.state, u, ctx.controller)
      }
    }
  },
})

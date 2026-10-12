import { type EffectAPI } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Break nearby Wards.'
export const wardbreaker = {
  genesis: (ctx: EffectAPI) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y)) {
        if (u.ward) {
          u.ward = false
          pushLog(ctx.state, ctx.controller, `${u.name}'s ward shatters.`)
        }
      }
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site?.ward) {
        site.ward = false
        pushLog(ctx.state, ctx.controller, `${site.name}'s ward shatters.`)
      }
    }
  },
}

import { registerScript } from '../registry'
import { pushLog, wardUnit } from '../../../engine/effects'

// 'Ward. When a minion leaves here, transfer this site's Ward to it.'
registerScript("Pilgrim's Shrine", {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (self) (self as any).ward = true // site ward — no Evil clause, kept direct
  },
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || !(self as any).ward || moved.isAvatar) return
    // "leaves here" — a site's "here" covers its subsurface too, so a minion swimming/burrowing away
    // from the shrine's subsurface also leaves here (no `from.region` gate). It must actually depart the
    // site (moved now elsewhere), not merely surface/submerge in place.
    if (from.x !== self.x || from.y !== self.y) return
    if (moved.x === self.x && moved.y === self.y) return
    // helper enforces the Evil clause on the departing unit; only drop the site's ward if it lands
    if (wardUnit(ctx.state, moved)) {
      ;(self as any).ward = false
      pushLog(ctx.state, moved.controller, `${moved.name} carries the Shrine's blessing onward.`)
    }
  },
})

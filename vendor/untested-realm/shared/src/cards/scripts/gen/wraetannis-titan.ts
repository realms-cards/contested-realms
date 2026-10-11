import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { strikeAllSimultaneous } from '../../../engine/effects'

// 'Genesis → Strike each enemy here.'
registerScript('Wraetannis Titan', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // strike each enemy here, in the CONTROLLER's chosen order (shared multi-strike helper)
    const foes = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.controller !== ctx.controller).map((u) => u.id)
    strikeAllSimultaneous(ctx.state, self.id, foes, ctx.controller)
  },
})

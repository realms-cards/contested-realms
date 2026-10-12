import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Until your next turn, units are Immobile while they occupy nearby sites.'
registerScript('Quagmire', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.immobileSites = ctx.state.flow.immobileSites ?? []
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      const s = siteAt(ctx.state, sq.x, sq.y)
      if (s) ctx.state.flow.immobileSites.push({ siteId: s.id, player: ctx.controller, turn: ctx.state.turn })
    }
    pushLog(ctx.state, ctx.controller, 'The ground turns to sucking mire.')
  },
})

import { registerScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'

// 'Enters the realm under an opponent's control.'
registerScript('Postern Gate', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    self.controller = opponent(ctx.controller)
    pushLog(ctx.state, ctx.controller, 'The Postern Gate opens for the enemy.')
  },
})

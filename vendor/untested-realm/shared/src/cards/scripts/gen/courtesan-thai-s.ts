import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// --------------------------------------------------------- Courtesan Thaïs ----
// 'Genesis → During their next turn, each player is controlled by the previous one.'
registerScript('Courtesan Thaïs', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.thaisPending = [0, 1]
    pushLog(ctx.state, ctx.controller, "💋 Courtesan Thaïs whispers her bargain: next turn, each player dances to the other's tune.")
  },
})

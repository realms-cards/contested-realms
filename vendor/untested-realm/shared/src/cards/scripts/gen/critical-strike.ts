import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'The next time an ally strikes a unit this turn, it deals double damage.'
registerScript('Critical Strike', {
  onCast: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.strikeFlags = [...(ctx.state.flow.strikeFlags ?? []), { player: ctx.controller, type: 'double' }]
    pushLog(ctx.state, ctx.controller, 'The next allied strike will hit twice as hard!')
  },
})

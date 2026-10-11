import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// ----------------------------------------------------------- Blood Mana ----
// 'The next spell you cast this turn costs life instead of mana.'
registerScript('Blood Mana', {
  onCast: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.bloodMana = { ...(ctx.state.flow.bloodMana ?? {}), [ctx.controller]: true }
    pushLog(ctx.state, ctx.controller, 'The next spell will be paid in blood.')
  },
})

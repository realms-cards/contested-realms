import { registerScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'

// "Genesis → On your opponent's next turn, their spells cost (1) more."
registerScript('Tax Collector', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.witchCurse = [...(ctx.state.flow.witchCurse ?? []), { player: opponent(ctx.controller), turn: ctx.state.turn }]
    pushLog(ctx.state, ctx.controller, 'The Tax Collector readies his ledger.')
  },
})

import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Until your next turn, minions are disabled while atop nearby sites.'
registerScript('Babbling Brook', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.areaDisables = ctx.state.flow.areaDisables ?? []
    ctx.state.flow.areaDisables.push({ siteId: ctx.sourceId, player: ctx.controller, turn: ctx.state.turn })
    pushLog(ctx.state, ctx.controller, 'The Babbling Brook lulls nearby minions into stupor.')
  },
})

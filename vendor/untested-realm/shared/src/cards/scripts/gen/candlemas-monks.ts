import { registerScript } from '../registry'

// 'Deathrite â†’ Proceed to the end phase.'
registerScript('Candlemas Monks', {
  deathrite: (ctx) => {
    // already in the end phase: there is nothing to proceed to (and it must not end the NEXT turn)
    if (ctx.state.phase === 'end') return
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.endPhaseNow = true
    ctx.log('The Monks toll the hour -- the turn draws to a close.')
  },
})

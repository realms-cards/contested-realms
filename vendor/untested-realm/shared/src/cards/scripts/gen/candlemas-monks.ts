import { registerScript } from '../registry'

// 'Deathrite â†’ Proceed to the end phase.'
registerScript('Candlemas Monks', {
  deathrite: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.endPhaseNow = true
    ctx.log('The Monks toll the hour -- the turn draws to a close.')
  },
})

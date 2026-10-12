import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → You can cast minions with 2 or less power to any site this turn.'
registerScript('Spore Spouts', {
  genesis: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.summonWindows = [
      ...(ctx.state.flow.summonWindows ?? []),
      { player: ctx.controller, turn: ctx.state.turn, maxPower: 2 },
    ]
    pushLog(ctx.state, ctx.controller, 'Spores drift across the realm — small things may sprout anywhere this turn.')
  },
})

import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Until your next turn, each ally takes 1 less damage for each other ally it's nearby.'
registerScript('Shield Wall', {
  onCast: (ctx) => {
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.shieldWall = [
      ...(ctx.state.flow.shieldWall ?? []),
      { player: ctx.controller, turn: ctx.state.turn },
    ]
    pushLog(ctx.state, ctx.controller, 'Shields lock — the wall holds.')
  },
})

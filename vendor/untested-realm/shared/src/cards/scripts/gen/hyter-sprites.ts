import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Name a spell. Spells with that name can't be cast until your next turn.'
registerScript('Hyter Sprites', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'nameCard', title: 'Hyter Sprites: name a spell to seal away.' }, 'named')
  },
  conts: {
    named: (ctx, _c, name) => {
      if (typeof name !== 'string' || !name) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.castBans = ctx.state.flow.castBans ?? []
      ctx.state.flow.castBans.push({ name, player: ctx.controller, turn: ctx.state.turn })
      pushLog(ctx.state, ctx.controller, `The Hyter Sprites seal away "${name}".`)
    },
  },
})

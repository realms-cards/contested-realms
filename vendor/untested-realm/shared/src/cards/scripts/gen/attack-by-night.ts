import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Enemies drop their artifacts. Allied units strike first this turn.'
registerScript('Attack by Night', {
  onCast: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller !== ctx.controller) {
        for (const artId of [...u.carrying]) {
          const art = ctx.state.artifacts[artId]
          if (art) {
            art.carriedBy = null
            art.x = u.x
            art.y = u.y
            art.region = u.region
          }
        }
        u.carrying = []
      } else {
        ctx.grantKeyword(u.id, 'strike first', 'endOfTurn')
      }
    }
    pushLog(ctx.state, ctx.controller, 'The night attack begins!')
  },
})

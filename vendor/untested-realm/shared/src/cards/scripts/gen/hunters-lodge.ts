import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Enemies lose Stealth.'
registerScript("Hunter's Lodge", {
  genesis: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (u.controller !== ctx.controller && u.stealth) {
        u.stealth = false
        pushLog(ctx.state, ctx.controller, `${u.name} is flushed out!`)
      }
    }
  },
})

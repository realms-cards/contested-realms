import { registerScript, type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'

// "Genesis & Deathrite → Set players' maximum life to their current life."
registerScript('Hemogoblin', {
  genesis: (ctx) => hemolock(ctx),
  deathrite: (ctx) => hemolock(ctx),
})

function hemolock(ctx: EffectAPI) {
  for (const u of Object.values(ctx.state.units)) {
    if (u.isAvatar) {
      u.counters = { ...u.counters, maxLife: u.life ?? 0 }
      pushLog(ctx.state, ctx.controller, `${u.name}'s maximum life is sealed at ${u.life}.`)
    }
  }
}

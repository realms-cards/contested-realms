import { registerScript } from '../registry'
import { pushLog, opponent } from '../../../engine/effects'
import { avatarOf } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// -------------------------------------------------------- Koschei's Egg ----
// 'Genesis → Avatar bearer hides its soul in Koschei's Egg, becoming immune
//  to death blows. After three of your turns, or if the Egg leaves the realm,
//  you lose.'
registerScript("Koschei's Egg", {
  genesis: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    const av = avatarOf(ctx.state, ctx.controller)
    if (!art || !av || art.carriedBy !== av.id) {
      pushLog(ctx.state, ctx.controller, 'The Egg sits inert — only an Avatar bearer can hide their soul in it.')
      return
    }
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.koschei = { player: ctx.controller, turns: 3 }
    pushLog(ctx.state, ctx.controller, `${av.name} hides their soul in Koschei's Egg. Three turns remain.`)
  },
  deathrite: (ctx) => {
    const k = ctx.state.flow?.koschei
    if (!k) return
    delete ctx.state.flow.koschei
    const loser = k.player as PlayerId
    pushLog(ctx.state, loser, `Koschei's Egg leaves the realm — ${ctx.state.players[loser].name}'s soul goes with it!`)
    ctx.state.winner = opponent(loser)
    ctx.state.phase = 'over'
  },
})

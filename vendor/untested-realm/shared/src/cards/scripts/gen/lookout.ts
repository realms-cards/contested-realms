import { registerScript } from '../registry'
import { pushLog, revealHand } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// "Genesis → Look at each opponent's hand."
registerScript('Lookout', {
  genesis: (ctx) => {
    const opp = (1 - ctx.controller) as PlayerId
    // reveal the opponent's hand to you (shown face-up in your view); don't leak
    // the names into the shared log
    revealHand(ctx.state, opp, ctx.controller)
    pushLog(ctx.state, ctx.controller, `Lookout reveals ${ctx.state.players[opp].name}'s hand to you.`)
  },
})

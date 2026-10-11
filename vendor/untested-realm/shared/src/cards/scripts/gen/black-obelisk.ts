import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// "Black Obelisk's site has 'At the start of your turn, lose 2 life and gain ② this turn.'"
registerScript('Black Obelisk', {
  startOfEachTurn: (ctx, activePlayer) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || art.carriedBy) return
    const site = siteAt(ctx.state, art.x, art.y)
    if (!site || site.controller !== activePlayer) return
    ctx.loseLife(activePlayer, 2)
    ctx.state.players[activePlayer].mana += 2
    pushLog(ctx.state, activePlayer, 'The Black Obelisk exacts its toll: 2 life for ②.')
  },
})

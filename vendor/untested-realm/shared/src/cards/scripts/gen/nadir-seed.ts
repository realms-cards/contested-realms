import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// "At the end of their turn, this site's controller loses life equal to their unspent mana."
registerScript('Nadir Seed', {
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    const site = siteAt(ctx.state, art.x, art.y)
    if (!site || site.controller === null) return
    if (site.controller !== ctx.state.activePlayer) return
    const unspent = ctx.state.players[site.controller].mana
    if (unspent > 0) ctx.loseLife(site.controller, unspent)
  },
})

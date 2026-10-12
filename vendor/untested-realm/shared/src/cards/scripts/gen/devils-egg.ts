import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// "At the end of each turn, the controller of Devil's Egg's site loses 1 life."
registerScript("Devil's Egg", {
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    const site = siteAt(ctx.state, art.x, art.y)
    if (site?.controller !== null && site?.controller !== undefined) ctx.loseLife(site.controller, 1)
  },
})

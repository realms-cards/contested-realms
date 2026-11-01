import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// "At the end of each turn, the controller of Angel's Egg's site heals 1 life."
registerScript("Angel's Egg", {
  actsUncontrolled: true, // names the SITE's controller, not its own: works on the ground, uncontrolled
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    const site = siteAt(ctx.state, art.x, art.y)
    if (site?.controller !== null && site?.controller !== undefined) ctx.gainLife(site.controller, 1)
  },
})

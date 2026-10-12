import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'

// 'At the end of your turn, if no enemy units occupy this site, permanently gain control of it.'
registerScript('Conqueror Worm', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const site = siteAt(ctx.state, self.x, self.y)
    if (!site || site.isRubble || site.controller === ctx.controller) return
    const enemies = unitsAt(ctx.state, self.x, self.y).filter((u) => u.controller !== ctx.controller)
    if (enemies.length === 0) {
      site.controller = ctx.controller
      pushLog(ctx.state, ctx.controller, `The Conqueror Worm claims ${site.name}!`)
    }
  },
})

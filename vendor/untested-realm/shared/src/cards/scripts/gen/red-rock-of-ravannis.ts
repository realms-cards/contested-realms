import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { inBounds, siteAt } from '../../../engine/grid'

// "Artifacts can't be carried here. / At the end of each turn, pull each
//  artifact one step towards this site, along with its bearer."
registerScript('Red Rock of Ravannis', {
  blocksCarryingHere: true,
  endOfEveryTurn: (ctx) => {
    const self = ctx.state.artifacts[ctx.sourceId]
    if (!self) return
    for (const a of Object.values(ctx.state.artifacts)) {
      if (a.id === self.id) continue
      if (a.x === self.x && a.y === self.y) continue
      const dx = Math.sign(self.x - a.x)
      const dy = Math.sign(self.y - a.y)
      // one orthogonal step, preferring the longer axis
      const step = Math.abs(self.x - a.x) >= Math.abs(self.y - a.y) ? { x: a.x + dx, y: a.y } : { x: a.x, y: a.y + dy }
      if (!inBounds(step.x, step.y) || !siteAt(ctx.state, step.x, step.y)) continue
      if (a.carriedBy) {
        const bearer = ctx.state.units[a.carriedBy]
        if (bearer) ctx.teleport(bearer.id, step.x, step.y, bearer.region)
      } else {
        a.x = step.x
        a.y = step.y
      }
    }
    pushLog(ctx.state, ctx.controller, 'The Red Rock drags all metal toward itself.')
  },
})

import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { pushLog } from '../../../engine/effects'
import type { GameState } from '../../../engine/types'

// "Bearer has 'You control this site.'" (Land Deed — control follows the bearer's square)
registerScript('Land Deed', {
  startOfTurn: (ctx) => landDeedSweep(ctx.state, ctx.sourceId),
  endOfEveryTurn: (ctx) => landDeedSweep(ctx.state, ctx.sourceId),
})

function landDeedSweep(state: GameState, artId: string) {
  const art = state.artifacts[artId]
  if (!art?.carriedBy) return
  const bearer = state.units[art.carriedBy]
  if (!bearer) return
  const site = siteAt(state, bearer.x, bearer.y)
  if (site && !site.isRubble && site.controller !== bearer.controller) {
    site.controller = bearer.controller
    pushLog(state, bearer.controller, `The Land Deed claims ${site.name}.`)
  }
}

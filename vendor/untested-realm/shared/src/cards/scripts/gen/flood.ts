import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { checkStateBased, applyFlood } from '../../../engine/effects'

// 'Affected sites are flooded. They're water sites.' (2x2 aura)
registerScript('Flood', {
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    for (const sq of aura.squares) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      // rubble floods too — flooded rubble becomes a body of water (applyFlood still honours Bedrock's
      // "can't be modified"). Only a siteless void square has nothing to flood.
      if (site) applyFlood(ctx.state, site, ctx.controller)
    }
    checkStateBased(ctx.state)
  },
})

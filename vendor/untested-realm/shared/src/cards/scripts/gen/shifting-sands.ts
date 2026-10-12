import { registerScript, getScript } from '../registry'
import { getCard } from '../../db'
import { makeCtx } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Reactivate the Genesis abilities of your nearby Deserts.'
registerScript('Shifting Sands', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      const s = siteAt(ctx.state, sq.x, sq.y)
      if (!s || s.id === self.id || s.controller !== ctx.controller || s.isRubble) continue
      if (!/desert/i.test(s.name) && !getCard(s.name).subtypes.includes('Desert')) continue
      const g = getScript(s.name)?.genesis
      if (g) g(makeCtx(ctx.state, s.id, ctx.controller, []))
    }
  },
})

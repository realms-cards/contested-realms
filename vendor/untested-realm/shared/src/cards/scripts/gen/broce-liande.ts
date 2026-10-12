import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Untap nearby Faeries. Tap nearby Mortals. Give nearby Beasts Stealth.'
registerScript('Brocéliande', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y)) {
        const st = effSubtypes(ctx.state, u)
        if (st.includes('Faerie')) u.tapped = false
        if (st.includes('Mortal')) u.tapped = true
        if (st.includes('Beast')) u.stealth = true
      }
    }
    pushLog(ctx.state, ctx.controller, 'The old forest stirs.')
  },
})

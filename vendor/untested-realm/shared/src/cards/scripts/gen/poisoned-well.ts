import { registerScript } from '../registry'
import { opponent } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Enemy Avatars lose 1 life for each nearby site they control.'
registerScript('Poisoned Well', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const opp = opponent(ctx.controller)
    let n = 0
    for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
      const s = siteAt(ctx.state, sq.x, sq.y)
      if (s && s.controller === opp && !s.isRubble) n++
    }
    if (n > 0) ctx.loseLife(opp, n)
  },
})

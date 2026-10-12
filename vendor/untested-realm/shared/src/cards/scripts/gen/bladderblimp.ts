import { registerScript } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// 'Airborne / Deathrite → Players lose 1 life for each nearby site they control.'
registerScript('Bladderblimp', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const pid of [0, 1] as PlayerId[]) {
      let n = 0
      for (const sq of nearbySquaresW(ctx.state, self.x, self.y)) {
        const site = siteAt(ctx.state, sq.x, sq.y)
        if (site?.controller === pid) n++
      }
      if (n > 0) ctx.loseLife(pid, n)
    }
  },
})

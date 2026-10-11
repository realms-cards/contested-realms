import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Draw a spell for each other adjacent Leyline Henge.'
registerScript('Leyline Henge', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    let n = 0
    for (const sq of adjacentSquaresW(ctx.state, self.x, self.y)) {
      if (sq.x === self.x && sq.y === self.y) continue
      const s = siteAt(ctx.state, sq.x, sq.y)
      if (s?.name === 'Leyline Henge') n++
    }
    if (n > 0) ctx.draw(ctx.controller, 'spellbook', n)
  },
})

import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'

// 'Spellcaster / Genesis → Summon a Skeleton token to each other adjacent site.'
registerScript('Master Necromancer', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    for (const sq of adjacentSquaresW(ctx.state, self.x, self.y)) {
      if (sq.x === self.x && sq.y === self.y) continue
      if (siteAt(ctx.state, sq.x, sq.y)) ctx.summonToken('Skeleton', ctx.controller, sq.x, sq.y)
    }
  },
})

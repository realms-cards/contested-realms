import { registerScript } from '../registry'
import { inBounds, unitsAt } from '../../../engine/grid'

// 'At the end of each turn, Sentinel Trap deals 4 damage to each unit at the
//  adjacent location it's facing, then rotates 90 degrees clockwise.'
registerScript('Sentinel Trap', {
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || art.carriedBy) return
    const dir = art.counters?.facing ?? 0 // 0 n, 1 e, 2 s, 3 w
    const dx = dir === 1 ? 1 : dir === 3 ? -1 : 0
    const dy = dir === 0 ? 1 : dir === 2 ? -1 : 0
    const tx = art.x + dx
    const ty = art.y + dy
    if (inBounds(tx, ty)) {
      for (const u of unitsAt(ctx.state, tx, ty, art.region)) ctx.dealDamage({ unit: u.id }, 4)
    }
    art.counters = { ...art.counters, facing: (dir + 1) % 4 }
  },
})

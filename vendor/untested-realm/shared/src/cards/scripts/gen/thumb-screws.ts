import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Whenever a nearby Avatar casts a spell, they lose life equal to the number
//  of spells they've cast this turn.'
registerScript('Thumb Screws', {
  onSpellCast: (ctx, by) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    art.counters = { ...art.counters }
    const key = `casts${by}`
    if (art.counters.turnMark !== ctx.state.turn) {
      art.counters.turnMark = ctx.state.turn
      art.counters.casts0 = 0
      art.counters.casts1 = 0
    }
    art.counters[key] = (art.counters[key] ?? 0) + 1
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === by)
    if (!avatar || !nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === avatar.x && s.y === avatar.y)) return
    ctx.loseLife(by, art.counters[key])
    pushLog(ctx.state, by, `The Thumb Screws tighten (${art.counters[key]}).`)
  },
})

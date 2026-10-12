import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// 'Whenever a nearby minion taps, its opponent draws a spell.'
registerScript('False Idol', {
  onUnitTapped: (ctx, tapped) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || tapped.isAvatar) return
    if (!nearbySquaresW(ctx.state, art.x, art.y).some((s) => s.x === tapped.x && s.y === tapped.y)) return
    ctx.draw((1 - tapped.controller) as PlayerId, 'spellbook')
  },
})

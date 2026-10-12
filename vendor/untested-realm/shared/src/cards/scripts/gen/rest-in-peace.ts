import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effSubtypes, canExistIn } from '../../../engine/statics'

// 'Whenever a Spirit or Undead minion occupies affected land sites, burrow it.'
registerScript('Rest in Peace', {
  onUnitEntersSquare: (ctx, moved) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura || moved.isAvatar || moved.region !== 'surface') return
    if (!aura.squares.some((s) => s.x === moved.x && s.y === moved.y)) return
    const st = effSubtypes(ctx.state, moved)
    if (!st.includes('Spirit') && !st.includes('Undead')) return
    if (canExistIn(ctx.state, moved, 'underground', moved.x, moved.y) || true) {
      moved.region = 'underground'
      pushLog(ctx.state, ctx.controller, `${moved.name} is dragged down to rest.`)
    }
  },
})

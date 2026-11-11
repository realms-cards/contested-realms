import { registerScript } from '../registry'
import { pushLog, moveProtected } from '../../../engine/effects'
import { effSubtypes, footprintAllTerrain } from '../../../engine/statics'
import { syncCarried } from '../../../engine/carrying'

// 'Whenever a Spirit or Undead minion occupies affected land sites, burrow it.'
// A forced burrow: only on LAND (Codex, Burrowing: it fails on a unit occupying a water site), and it
// doesn't grant Burrowing — a minion without it then dies underground (state-based check).
registerScript('Rest in Peace', {
  onUnitEntersSquare: (ctx, moved) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura || moved.isAvatar || moved.region !== 'surface') return
    if (!aura.squares.some((s) => s.x === moved.x && s.y === moved.y)) return
    const st = effSubtypes(ctx.state, moved)
    if (!st.includes('Spirit') && !st.includes('Undead')) return
    if (!footprintAllTerrain(ctx.state, moved, 'land')) return
    if (moveProtected(ctx.state, moved, ctx.controller)) return
    moved.region = 'underground'
    syncCarried(ctx.state, moved)
    pushLog(ctx.state, ctx.controller, `${moved.name} is dragged down to rest.`)
  },
})

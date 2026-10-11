import { registerScript } from '../registry'
import { pushLog, recordTick, beginAreaReveal } from '../../../engine/effects'
import { applyGrid, diamondCells } from '../multi-card-utils/apply-grid'

// 'Enters with 6 counters, loses one at the end of each turn, then detonates:
// 5x5 diamond [_,2,4,2,_ / 2,4,8,4,2 / 4,8,20,8,4 / 2,4,8,4,2 / _,2,4,2,_]'
registerScript('Doomsday Device', {
  genesis: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (art) art.counters = { fuse: 6 }
  },
  endOfEveryTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art) return
    art.counters = art.counters ?? { fuse: 6 }
    art.counters.fuse -= 1
    const left = Math.max(0, art.counters.fuse)
    // a carried device rides its bearer, so float the tick (and blast) at the CARRIER's live square,
    // not the artifact's stale ground coords
    const bearer = art.carriedBy ? ctx.state.units[art.carriedBy] : null
    const pos = bearer ? { x: bearer.x, y: bearer.y } : { x: art.x, y: art.y }
    pushLog(ctx.state, ctx.controller, `Doomsday Device: ${left} tick(s) left...`)
    // flash the fresh count over the device each time it ticks (white-bordered black writing)
    recordTick(ctx.state, pos.x, pos.y, left > 0 ? `${left}` : '☢')
    if (art.counters.fuse > 0) return
    const origin = { x: pos.x, y: pos.y }
    const cells = diamondCells((d) => [20, 8, 4, 2][d] ?? 0)
    // open a both-player grid reveal so the blast lights up like a cast area spell — themed BLACK
    // (this tick isn't a cast, so nothing opened one for us; applyGrid → recordAreaReveal fills it in)
    beginAreaReveal(ctx.state, 'doomsday', 'Doomsday Device', art.id, false)
    ctx.breakArtifact(art.id)
    applyGrid(ctx, origin, cells, 'n', { region: 'allRegions' })
    pushLog(ctx.state, ctx.controller, '☢ DETONATION!')
  },
})

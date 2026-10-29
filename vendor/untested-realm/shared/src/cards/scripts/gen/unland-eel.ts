import { registerScript } from '../registry'
import { pushLog, trySubmerge } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Whenever Unland Eel submerges, it may drag another minion here down with it.'
registerScript('Unland Eel', {
  onUnitEntersSquare: (ctx, moved, from) => {
    if (moved.id !== ctx.sourceId || moved.region !== 'underwater') return
    // to submerge is to go from the surface of a water site to its underwater (Codex, Submerge) — not
    // being summoned underwater, nor swimming between underwater locations
    if (from.region !== 'surface' || from.x !== moved.x || from.y !== moved.y) return
    const prey = unitsAt(ctx.state, moved.x, moved.y, 'surface').filter((u) => !u.isAvatar).map((u) => u.id)
    if (!prey.length) return
    // "another minion here", not a target: a Ward doesn't break over the drag (Codex, Ward)
    ctx.ask({ kind: 'chooseTargets', title: 'The Eel drags which minion under? (skip for none)', data: { candidates: prey, count: 1, upTo: true, kind: 'unit', notTargeted: true } }, 'drag')
  },
  conts: {
    drag: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      if (trySubmerge(ctx.state, u, ctx.controller)) pushLog(ctx.state, ctx.controller, `${u.name} is dragged beneath the surface!`)
    },
  },
})

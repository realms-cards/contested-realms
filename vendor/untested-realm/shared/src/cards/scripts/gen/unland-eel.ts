import { registerScript } from '../registry'
import { pushLog, trySubmerge } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Whenever Unland Eel submerges, it may drag another minion here down with it.'
registerScript('Unland Eel', {
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId || moved.region !== 'underwater') return
    const prey = unitsAt(ctx.state, moved.x, moved.y, 'surface').filter((u) => !u.isAvatar).map((u) => u.id)
    if (!prey.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Eel drags which minion under? (skip for none)', data: { candidates: prey, count: 1, upTo: true, kind: 'unit' } }, 'drag')
  },
  conts: {
    drag: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      if (trySubmerge(ctx.state, u)) pushLog(ctx.state, ctx.controller, `${u.name} is dragged beneath the surface!`)
    },
  },
})

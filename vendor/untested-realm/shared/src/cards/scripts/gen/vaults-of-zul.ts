import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'The first time an Avatar stops here, they draw three cards and skip their next turn.'
registerScript('Vaults of Zul', {
  onUnitEntersSquare: (ctx, moved, _from, _via, final) => {
    if (final === false) return // only when the avatar STOPS here, not merely passes through (FAQ2)
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || !moved.isAvatar) return
    if (moved.x !== self.x || moved.y !== self.y || moved.region !== 'surface') return
    if (self.counters?.zul) return // "the first time" — once per GAME total, for either avatar (FAQ3)
    self.counters = { ...self.counters, zul: 1 }
    ctx.drawCard(moved.controller, 3)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.skipTurn = { ...(ctx.state.flow.skipTurn ?? {}), [moved.controller]: 1 }
    pushLog(ctx.state, moved.controller, `${moved.name} plunders the Vaults — three cards, at the price of a lost turn.`)
  },
})

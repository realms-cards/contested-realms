import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'Genesis → Kill a nearby Monster.'  (no "target" → reaches hidden regions too)
registerScript('Monster Hunter', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, label: 'a nearby Monster',
    filter: (state, u) => hasSubtype(state, u, 'Monster'),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const self = ctx.state.units[ctx.sourceId]
    const u = ctx.state.units[t.unit]
    if (!self || !u) return
    if (nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y) && hasSubtype(ctx.state, u, 'Monster')) {
      ctx.kill(u.id)
    }
  },
})

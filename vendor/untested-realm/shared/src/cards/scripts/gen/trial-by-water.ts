import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { submergeOrDrown } from '../multi-card-utils/submerge-or-drown'

// 'An ally submerges target minion it's nearby.'
registerScript('Trial by Water', {
  targets: [
    { what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an ally' },
    { what: 'minion', count: 1, targeted: true, label: 'target minion nearby them' },
  ],
  onCast: (ctx) => {
    const [t1, t2] = ctx.targets
    if (!t1 || !t2 || !('unit' in t1) || !('unit' in t2)) return
    const ally = ctx.state.units[t1.unit]
    const victim = ctx.state.units[t2.unit]
    if (!ally || !victim) return
    if (!nearbySquaresW(ctx.state, ally.x, ally.y).some((s) => s.x === victim.x && s.y === victim.y)) return ctx.log('Not nearby.')
    submergeOrDrown(ctx, victim)
  },
})

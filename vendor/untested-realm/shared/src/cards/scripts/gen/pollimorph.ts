import { registerScript } from '../registry'
import { transformIntoToken } from '../../../engine/effects'

// 'Transform target nearby minion into a Frog token.'
registerScript('Pollimorph', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    // a transform, not an entry: the Frog takes its place without "entering" (transformIntoToken)
    if (u) transformIntoToken(ctx.state, u, 'Frog')
  },
})

import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'
import { transformIntoToken } from '../../../engine/effects'

// 'Transform a Mortal into a Foot Soldier token.'
registerScript('Degradation', {
  targets: [{
    what: 'minion', count: 1, targeted: false, label: 'a Mortal',
    filter: (state, u) => hasSubtype(state, u, 'Mortal'),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    // a transform, not an entry: the Foot Soldier takes its place without "entering"
    if (u) transformIntoToken(ctx.state, u, 'Foot Soldier')
  },
})

import { registerScript } from '../registry'
import { terrainAt, hasSubtype } from '../../../engine/statics'
import { checkStateBased } from '../../../engine/effects'

// 'Genesis → Burrow target adjacent Undead.'
registerScript('Gravedigger', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent Undead',
    filter: (state, u) => hasSubtype(state, u, 'Undead'),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (u && terrainAt(ctx.state, u.x, u.y) === 'land') {
      u.region = 'underground'
      checkStateBased(ctx.state)
    }
  },
})

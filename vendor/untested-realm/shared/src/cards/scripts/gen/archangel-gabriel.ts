import { registerScript } from '../registry'
import { drawLocked } from '../multi-card-utils/draw-locked'

// 'Genesis → Choose another allied minion. They draw a spell, which only they can cast.'
registerScript('Archangel Gabriel', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, owner: 'ally', label: 'another allied minion',
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t) || t.unit === ctx.sourceId) return
    const chosen = ctx.state.units[t.unit]
    if (!chosen) return
    drawLocked(ctx, chosen.id, chosen.name, true) // Gabriel grants the ability to cast it (FAQ)
  },
})

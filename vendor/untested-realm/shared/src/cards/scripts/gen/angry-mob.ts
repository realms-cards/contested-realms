import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Genesis → Kill target adjacent Unique or Elite minion.'
registerScript('Angry Mob', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent Unique or Elite minion',
    filter: (state, u) => ['Unique', 'Elite'].includes(getCard(u.name).rarity ?? ''),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.kill(t.unit)
  },
})

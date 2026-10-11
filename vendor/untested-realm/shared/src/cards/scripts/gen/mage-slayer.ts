import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Genesis → Kill target Spellcaster minion nearby.'
registerScript('Mage Slayer', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'nearby', label: 'target Spellcaster minion nearby',
    filter: (state, u) => getCard(u.name).text.toLowerCase().includes('spellcaster'),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.kill(t.unit)
  },
})

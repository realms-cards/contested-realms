import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Elite minions cost (1) less to cast to this site.'
registerScript('Major City', {
  costModifier: (state, sourceId, caster, cardName, at) => {
    const site = state.sites[sourceId]
    if (!site || !at || !(site.x === at.x && site.y === at.y)) return 0
    const def = getCard(cardName)
    return def.type === 'Minion' && def.rarity === 'Elite' ? -1 : 0
  },
})

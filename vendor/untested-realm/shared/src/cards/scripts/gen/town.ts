import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Exceptional minions cost (1) less to cast to this site.'
registerScript('Town', {
  costModifier: (state, sourceId, _caster, cardName, at) => {
    const site = state.sites[sourceId]
    if (!site || !at || site.x !== at.x || site.y !== at.y) return 0
    const def = getCard(cardName)
    return def.type === 'Minion' && def.rarity === 'Exceptional' ? -1 : 0
  },
})

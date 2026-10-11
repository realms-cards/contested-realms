import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Anyone may cast minions here and they may do so for ① less.'
registerScript('Donnybrook Inn', {
  siteAllowsAnySummon: true,
  costModifier: (state, sourceId, _caster, cardName, at) => {
    if (!at) return 0
    const inn = state.sites[sourceId]
    if (!inn || inn.x !== at.x || inn.y !== at.y) return 0
    return getCard(cardName).type === 'Minion' ? -1 : 0
  },
})

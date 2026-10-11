import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Anyone may conjure Weapons and Armor here, and for ① less.'
registerScript('Dwarven Forge', {
  siteAllowsAnyConjure: (_state, cardName) => {
    const st = getCard(cardName).subtypes
    return st.includes('Weapon') || st.includes('Armor')
  },
  costModifier: (state, sourceId, _caster, cardName, at) => {
    const site = state.sites[sourceId]
    if (!site || !at || site.x !== at.x || site.y !== at.y) return 0
    const st = getCard(cardName).subtypes
    return st.includes('Weapon') || st.includes('Armor') ? -1 : 0
  },
})

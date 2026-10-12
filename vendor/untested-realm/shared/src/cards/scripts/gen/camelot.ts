import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW } from '../../../engine/grid'

// (the four elemental Mixes are sacrifice artifacts — correctly scripted in m38)

// 'Unique minions cost (1) less to cast to nearby sites.'
registerScript('Camelot', {
  costModifier: (state, sourceId, caster, cardName, at) => {
    const site = state.sites[sourceId]
    if (!site || !at) return 0
    const def = getCard(cardName)
    if (def.type !== 'Minion' || def.rarity !== 'Unique') return 0
    return nearbySquaresW(state, site.x, site.y).some((s) => s.x === at.x && s.y === at.y) ? -1 : 0
  },
})

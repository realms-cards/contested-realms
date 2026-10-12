import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Provides (3) while in the void.'
registerScript('Ether Core', {
  extraManaEachTurn: (state, sourceId) => {
    const art = state.artifacts[sourceId]
    return art && art.region === 'void' && !siteAt(state, art.x, art.y) ? 3 : 0
  },
})

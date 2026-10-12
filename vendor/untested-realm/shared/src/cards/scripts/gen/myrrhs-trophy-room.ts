import { registerScript } from '../registry'
import { getCard } from '../../db'
import type { PlayerId } from '../../../engine/types'

// "Provides an additional (1) for each Unique minion in an opponent's cemetery."
registerScript("Myrrh's Trophy Room", {
  siteExtraManaFn: (state, siteId) => {
    const site = state.sites[siteId]
    if (!site || site.controller === null) return 0
    const opp = (1 - site.controller) as PlayerId
    return state.players[opp].cemetery.filter((id) => {
      const def = getCard(state.cards[id].name)
      return def.type === 'Minion' && def.rarity === 'Unique'
    }).length
  },
})

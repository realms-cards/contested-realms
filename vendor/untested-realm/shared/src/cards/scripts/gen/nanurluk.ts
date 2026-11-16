import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isBearName } from '../multi-card-utils/is-bear'

// 'Has Charge if there are Bears or sites in your cemetery.'
// "Your cemetery" = its controller's. Bears are named, not subtyped (is-bear.ts).
registerScript('Nanurluk', {
  selfKeywords: (state, self) => {
    const grave = state.players[self.controller].cemetery
    return grave.some((id) => {
      const name = state.cards[id]?.name
      return !!name && (isBearName(name) || getCard(name).type === 'Site')
    }) ? ['charge'] : []
  },
})

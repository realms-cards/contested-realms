import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Has +1 power for each of your dead Beasts.'
registerScript('Wolpertinger', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    return state.players[self.controller].cemetery.filter((id) =>
      getCard(state.cards[id].name).subtypes.includes('Beast'),
    ).length
  },
})

import { registerScript } from '../registry'

// 'Has +1 power for each Search Party in your cemetery.'
registerScript('Search Party', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    return state.players[self.controller].cemetery.filter((id) => state.cards[id].name === 'Search Party').length
  },
})

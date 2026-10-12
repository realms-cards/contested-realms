import { registerScript } from '../registry'

// 'Has Charge if there are dead Squeakers.'
registerScript('Grand Old Boar', {
  selfGrantOnly: true, // grants Charge only to itself → excluded from the cross-unit static-grant index
  grantsKeywords: (state, self, other) => {
    if (other.id !== self.id) return []
    const deadSqueakers = state.players.some((p) => p.cemetery.some((id) => state.cards[id].name.includes('Squeaker')))
    return deadSqueakers ? ['charge'] : []
  },
})

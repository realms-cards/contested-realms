import { registerScript } from '../registry'
import { terrainAt } from '../../../engine/statics'
import { connected } from '../multi-card-utils/connected'

// 'Burrowing / Has +1 power for each site in their span of land.'
// Codex, Span of Land: the contiguous group of adjacent land sites (whoever controls them) that the card
// occupies — on the surface or underground. On a water site, or in the void, they have no span of land.
// The bonus is an ability (lost while silenced or disabled), so it's a self-only grant, not selfPower.
registerScript('Myrmidons', {
  selfGrantOnly: true,
  grantsPower: (state, self, other) => {
    if (other.id !== self.id || self.region === 'void' || self.region === 'underwater') return 0
    return connected(state, self.x, self.y, (x, y) => terrainAt(state, x, y) === 'land').length
  },
})

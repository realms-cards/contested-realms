import { registerScript } from '../registry'
import { GRID_H, nearbySquaresW } from '../../../engine/grid'

// 'Has +7 power while in your back row and no royalty is nearby.'
registerScript('Overbearing Bailiff', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    const backY = self.controller === 0 ? 0 : GRID_H - 1
    if (self.y !== backY) return 0
    const royaltyNear = Object.values(state.units).some(
      // nearby minion is region-locked to the source
      (u) => u.id !== self.id && u.region === self.region && /\b(King|Queen|Prince|Princess)\b/.test(u.name) &&
        nearbySquaresW(state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y),
    )
    return royaltyNear ? 0 : 7
  },
})

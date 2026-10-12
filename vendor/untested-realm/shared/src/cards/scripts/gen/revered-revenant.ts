import { registerScript } from '../registry'
import { getCard } from '../../db'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Has 0 power unless adjacent to an allied Ward.'
registerScript('Revered Revenant', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    const warded = Object.values(state.units).some(
      // adjacent minion is region-locked to the source
      (u) => u.controller === self.controller && u.ward && u.region === self.region && orthAdjacentWrapped(state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y),
    )
    return warded ? 0 : -(getCard(self.name).attack ?? 0)
  },
})

import { registerScript } from '../registry'
import { GRID_W, siteAt } from '../../../engine/grid'

// 'Submerge, Voidwalk / Has +1 power for each void in their row.'
registerScript('Aaj-kegon Ghost Crabs', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    let n = 0
    for (let x = 0; x < GRID_W; x++) if (!siteAt(state, x, self.y)) n++
    return n
  },
})

import { registerScript } from '../registry'
import { siteAt, occupiedSquares, occupies, inBounds } from '../../../engine/grid'
import { isVoidAt } from '../../../engine/statics'
import type { Step } from '../../../engine/types'
import { ORTH } from '../multi-card-utils/orth'

// ------------------------------------------------------------ Aethermoeba ----
// 'Voidwalk / Moves by expanding from any part of itself. It occupies all
//  locations it has ever occupied, and has +1 power for each one that is void.'
registerScript('Aethermoeba', {
  occupiesAllVisited: true,
  selfPower: (state, self) => occupiedSquares(self).filter((s) => isVoidAt(state, s.x, s.y)).length,
  extraSteps: (state, unit, from) => {
    if (from.x !== unit.x || from.y !== unit.y || from.region !== unit.region) return []
    const out: Step[] = []
    for (const part of occupiedSquares(unit)) {
      for (const [dx, dy] of ORTH) {
        const x = part.x + dx
        const y = part.y + dy
        if (!inBounds(x, y) || occupies(unit, x, y)) continue
        if (!out.some((s) => s.x === x && s.y === y)) out.push({ x, y, region: siteAt(state, x, y) ? 'surface' : 'void' })
      }
    }
    return out
  },
})

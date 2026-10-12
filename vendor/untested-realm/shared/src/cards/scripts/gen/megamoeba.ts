import { registerScript } from '../registry'
import { siteAt, occupiedSquares, occupies, inBounds } from '../../../engine/grid'
import type { Step } from '../../../engine/types'
import { ORTH } from '../multi-card-utils/orth'

// ------------------------------------------------------------- Megamoeba ----
// 'Megamoeba moves by extending a single pseudopod from any part of itself.
//  It occupies all locations it has ever occupied, and has +1 power for each.'
registerScript('Megamoeba', {
  occupiesAllVisited: true,
  selfPower: (_state, self) => occupiedSquares(self).length,
  extraSteps: (state, unit, from) => {
    // pseudopods extend from ANY part of the body, not just the head
    if (from.x !== unit.x || from.y !== unit.y || from.region !== unit.region) return []
    const out: Step[] = []
    for (const part of occupiedSquares(unit)) {
      for (const [dx, dy] of ORTH) {
        const x = part.x + dx
        const y = part.y + dy
        if (!inBounds(x, y) || !siteAt(state, x, y) || occupies(unit, x, y)) continue
        if (!out.some((s) => s.x === x && s.y === y)) out.push({ x, y, region: 'surface' })
      }
    }
    return out
  },
})

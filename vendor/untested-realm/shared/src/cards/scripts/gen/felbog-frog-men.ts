import { registerScript } from '../registry'
import { inBounds, siteAt } from '../../../engine/grid'

// 'Can leap entirely over adjacent sites in one step.'
registerScript('Felbog Frog Men', {
  extraSteps: (state, unit, from) => {
    if (from.region !== 'surface') return []
    const out = []
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
      const overX = from.x + dx / 2
      const overY = from.y + dy / 2
      const x = from.x + dx
      const y = from.y + dy
      if (!inBounds(x, y)) continue
      if (!siteAt(state, overX, overY)) continue // must leap OVER a site
      if (!siteAt(state, x, y)) continue
      out.push({ x, y, region: 'surface' as const })
    }
    return out
  },
})

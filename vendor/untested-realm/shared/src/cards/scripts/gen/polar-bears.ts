import { registerScript } from '../registry'
import { GRID_H, siteAt } from '../../../engine/grid'

// 'The top and bottom edges of the realm are adjacent for Polar Bears.'
registerScript('Polar Bears', {
  extraSteps: (state, unit, from) => {
    if (unit.name !== 'Polar Bears' || from.region !== 'surface') return []
    const wrapY = from.y === 0 ? GRID_H - 1 : from.y === GRID_H - 1 ? 0 : null
    if (wrapY === null || !siteAt(state, from.x, wrapY)) return []
    return [{ x: from.x, y: wrapY, region: 'surface' as const }]
  },
})

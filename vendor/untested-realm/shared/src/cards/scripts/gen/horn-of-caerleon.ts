import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Nearby minions have Charge.'
registerScript('Horn of Caerleon', {
  artifactGrantsKeywords: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    if (!art || unit.isAvatar) return []
    return nearbySquaresW(state, art.x, art.y).some((s) => s.x === unit.x && s.y === unit.y) ? ['charge'] : []
  },
})

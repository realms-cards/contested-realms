import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'

// 'Must always be adjacent to the void.'
registerScript('Edge of the World', {
  sitePlacement: (state, player, at) => {
    const voidAdjacent = adjacentSquaresW(state, at.x, at.y).some((s) => !(s.x === at.x && s.y === at.y) && !siteAt(state, s.x, s.y))
    return voidAdjacent ? null : 'deny'
  },
})

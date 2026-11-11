import { registerScript } from '../registry'
import { adjacentSquaresW, siteAt } from '../../../engine/grid'

// 'Must always be adjacent to the void.'
// Where it's played (sitePlacement) and ever after (mustAdjoinVoid: statics.strandedSites stops any site
// move, pull-apart or play that would take its last void away).
registerScript('Edge of the World', {
  mustAdjoinVoid: true,
  sitePlacement: (state, player, at) => {
    const voidAdjacent = adjacentSquaresW(state, at.x, at.y).some((s) => !(s.x === at.x && s.y === at.y) && !siteAt(state, s.x, s.y))
    return voidAdjacent ? null : 'deny'
  },
})

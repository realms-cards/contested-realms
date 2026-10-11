import { registerScript } from '../registry'
import { siteAt, orthAdjacentWrapped } from '../../../engine/grid'

// 'Provides no mana or threshold if not adjacent to the void.'
registerScript('The Colour Out of Space', {
  // "adjacent to the void" (a siteless square) is Magellan-aware: a wrapped neighbour across the joined
  // edge is a real square that may itself be void. orthAdjacentWrapped drops off-board squares when there
  // is no Globe, so an edge site still isn't "adjacent to void" just for touching the board boundary.
  siteProvides: (state, site) =>
    orthAdjacentWrapped(state, site.x, site.y).some((s) => !siteAt(state, s.x, s.y)),
})

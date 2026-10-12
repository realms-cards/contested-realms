import { registerScript } from '../registry'
import { GRID_W } from '../../../engine/grid'

// 'Voidwalk / Must be cast to an outer column.'
registerScript('Forsaken', {
  summonFilter: (state, player, at) => (at.x === 0 || at.x === GRID_W - 1 ? null : 'Forsaken must be cast to an outer column.'),
})

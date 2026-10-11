import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt, siteAt, GRID_W } from '../../../engine/grid'

// 'Voidwalk / Must be cast to a corner void, costing (2) less for each unit in an adjacent square.'
registerScript('Dormant Monstrosity', {
  summonFilter: (state, player, at) => {
    const corner = (at.x === 0 || at.x === GRID_W - 1) && (at.y === 0 || at.y === 3)
    if (!corner) return 'Dormant Monstrosity must be cast to a corner.'
    if (siteAt(state, at.x, at.y)) return 'That corner is not void.'
    return null
  },
  selfCostModifier: (state, player, at) => {
    if (!at) return 0
    let discount = 0
    for (const sq of adjacentSquaresW(state, at.x, at.y)) {
      if (sq.x === at.x && sq.y === at.y) continue
      discount -= 2 * unitsAt(state, sq.x, sq.y).length
    }
    return discount
  },
})

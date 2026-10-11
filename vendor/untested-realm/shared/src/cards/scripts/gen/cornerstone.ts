import { registerScript } from '../registry'
import { GRID_H, GRID_W } from '../../../engine/grid'

// (Updraft Ridge is implemented in m23.ts via the siteFreeStep hook.)

// 'You may play this site to any corner.'
registerScript('Cornerstone', {
  sitePlacement: (state, player, at) => {
    const corner = (at.x === 0 || at.x === GRID_W - 1) && (at.y === 0 || at.y === GRID_H - 1)
    return corner ? 'allow' : null
  },
})

import { registerScript } from '../registry'
import { GRID_W, GRID_H } from '../../../engine/grid'
import { riftShifts, riftEntry } from '../multi-card-utils/rift-entry'

registerScript('Rift Valley', {
  extraSiteSquares: (state) => {
    const out: { x: number; y: number }[] = []
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) {
        if (riftShifts(state, x, y).length) out.push({ x, y })
      }
    }
    return out
  },
  customSitePlay: (state, player, cardId, x, y) => riftEntry(state, player, cardId, x, y),
})

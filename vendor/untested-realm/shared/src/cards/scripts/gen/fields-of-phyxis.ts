import { registerScript } from '../registry'
import { edgesConnected, GRID_H } from '../../../engine/grid'

// 'The site directly in front is silenced.'
registerScript('Fields of Phyxis', {
  silencesSiteAt: (state, self, target) => {
    if (self.controller === null) return false
    let front = self.controller === 0 ? self.y + 1 : self.y - 1
    // "directly in front" wraps to the far edge under a Magellan Globe (a real square there); without
    // one an off-board front row never matches a real site, so this stays a no-op.
    if (edgesConnected(state)) front = ((front % GRID_H) + GRID_H) % GRID_H
    return target.x === self.x && target.y === front
  },
})

import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// "Ward / Your opponent can't destroy nearby sites."
registerScript('Order of the Sacred Oak', {
  protectsSite: (state, self, site) => nearbySquaresW(state, self.x, self.y).some((s) => s.x === site.x && s.y === site.y),
})

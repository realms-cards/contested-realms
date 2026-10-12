import { registerScript } from '../registry'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'

// "Can't be moved by force. / Has +1 power for each adjacent site."
registerScript('Talamh Dreig', {
  immovable: true,
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    return orthAdjacentWrapped(state, self.x, self.y).filter((s) => siteAt(state, s.x, s.y)).length
  },
})

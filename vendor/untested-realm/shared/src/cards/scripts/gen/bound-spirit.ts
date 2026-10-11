import { registerScript } from '../registry'
import { getCard } from '../../db'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'

// 'Disabled unless adjacent to an allied Spellcaster.'
registerScript('Bound Spirit', {
  selfDisabled: (state, self) => {
    return !adjacentSquaresW(state, self.x, self.y).some((s) =>
      unitsAt(state, s.x, s.y, self.region).some((u) => {
        if (u.id === self.id || u.controller !== self.controller) return false
        return u.isAvatar || /spellcaster/i.test(getCard(u.name).text)
      }),
    )
  },
})

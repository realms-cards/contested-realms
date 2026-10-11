import { registerScript } from '../registry'
import { GRID_H } from '../../../engine/grid'

// (Flamecaller scripted in m1.)

// 'Vanguard Knights have +2 power if they alone are the furthest forward of your units.'
registerScript('Vanguard Knights', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    const forward = (u: { y: number }) => (self.controller === 0 ? u.y : GRID_H - 1 - u.y)
    const mine = Object.values(state.units).filter((u) => u.controller === self.controller)
    const best = Math.max(...mine.map(forward))
    if (forward(self) !== best) return 0
    return mine.filter((u) => forward(u) === best).length === 1 ? 2 : 0
  },
})

import { registerScript } from '../registry'

// "Has +2 power if you've lost life this turn."
registerScript('Enraged Familiar', {
  grantsPower: (state, self, other) =>
    other.id === self.id && (state.flow?.lifeLost?.[self.controller] ?? 0) > 0 ? 2 : 0,
})

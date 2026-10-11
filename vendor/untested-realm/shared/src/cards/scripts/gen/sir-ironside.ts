import { registerScript } from '../registry'

// 'Has +3 power during enemy turns.'
registerScript('Sir Ironside', {
  grantsPower: (state, self, other) =>
    other.id === self.id && state.activePlayer !== self.controller ? 3 : 0,
})

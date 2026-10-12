import { registerScript } from '../registry'

// 'Burrowing / While Root Spider is burrowed, minions directly above it are disabled.'
registerScript('Root Spider', {
  disablesOther: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || self.region !== 'underground' || unit.isAvatar) return false
    return unit.x === self.x && unit.y === self.y && unit.region === 'surface'
  },
})

import { registerScript } from '../registry'

// 'Other allies have +3 power while successfully attacking sites.'
registerScript('Boudicca', {
  siteStrikeBonus: (state, selfId, striker) => {
    const self = state.units[selfId]
    if (!self || striker.id === selfId || striker.controller !== self.controller) return 0
    return 3
  },
})

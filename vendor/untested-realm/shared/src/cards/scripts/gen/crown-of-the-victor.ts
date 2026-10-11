import { registerScript } from '../registry'

// 'Bearer has +3 power if they've ever killed a minion.'
registerScript('Crown of the Victor', {
  artifactGrantsPower: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    return art?.carriedBy === unit.id && unit.counters?.everKilled ? 3 : 0
  },
})

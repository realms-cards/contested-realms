import { registerScript } from '../registry'

// 'Can only move themselves forward.' (forward = toward the enemy's back row)
registerScript('Dalcean Phalanx', {
  stepFilter: (state, unit, from, to) => {
    const dy = unit.controller === 0 ? 1 : -1
    return (to.y - from.y) * dy > 0 || (to.y === from.y && to.x === from.x && to.region !== from.region)
  },
})

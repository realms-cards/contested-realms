import { registerScript } from '../registry'

// 'Can only move themselves sideways.'
registerScript('Sedge Crabs', {
  stepFilter: (state, unit, from, to) => to.y === from.y,
})

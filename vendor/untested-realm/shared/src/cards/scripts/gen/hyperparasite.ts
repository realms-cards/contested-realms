import { registerScript } from '../registry'

// "Can pick up a single minion, disabling them, but can't move while carrying them."
registerScript('Hyperparasite', {
  carryUnits: { capacity: 1 },
  carriedAreDisabled: true,
  selfGrantOnly: true, // grants Immobile only to itself → excluded from the cross-unit static-grant index
  grantsKeywords: (state, self, other) =>
    other.id === self.id && self.carryingUnits.length > 0 ? ['immobile'] : [],
})

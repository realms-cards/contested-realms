import { registerScript } from '../registry'

// 'Has Airborne and +1 power while Warded.'
registerScript('Angel Ascendant', {
  selfGrantOnly: true, // grants only to itself → excluded from the cross-unit static-grant index
  grantsKeywords: (state, self, other) => (other.id === self.id && self.ward ? ['airborne'] : []),
  grantsPower: (state, self, other) => (other.id === self.id && self.ward ? 1 : 0),
})

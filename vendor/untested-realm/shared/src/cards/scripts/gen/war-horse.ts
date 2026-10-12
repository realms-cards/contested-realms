import { registerScript } from '../registry'

// 'Charge, May carry an ally.' — an ally INCLUDES your Avatar (a mount can carry it).
registerScript('War Horse', {
  carryUnits: { capacity: 1, allowAvatar: true, filter: (state, carrier, target) => target.controller === carrier.controller },
})

import { registerScript } from '../registry'

// 'Charge, Movement +1 / May carry an ally.' — ally includes the Avatar.
registerScript('Fine Courser', {
  carryUnits: { capacity: 1, allowAvatar: true, filter: (state, carrier, target) => target.controller === carrier.controller },
})

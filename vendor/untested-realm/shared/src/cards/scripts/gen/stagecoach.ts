import { registerScript } from '../registry'

// 'Charge / May carry any number of minions.' (any controller!)
registerScript('Stagecoach', {
  carryUnits: { capacity: 'any', filter: (state, carrier, target) => !target.isAvatar },
})

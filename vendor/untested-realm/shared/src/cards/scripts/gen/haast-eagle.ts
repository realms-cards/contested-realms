import { registerScript } from '../registry'
import { alliedMinion, avgPower } from './minion-helpers'

// 'Airborne / May carry a weaker allied minion.'
registerScript('Haast Eagle', {
  carryUnits: {
    capacity: 1,
    filter: (state, carrier, target) =>
      alliedMinion(state, carrier, target) && avgPower(state, target) < avgPower(state, carrier),
  },
})

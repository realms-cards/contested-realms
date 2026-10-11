import { registerScript } from '../registry'
import { alliedMinion } from './minion-helpers'

// 'Movement +2, Voidwalk / May carry an allied minion.'
registerScript('Phantom Steed', {
  carryUnits: { capacity: 1, filter: alliedMinion },
})

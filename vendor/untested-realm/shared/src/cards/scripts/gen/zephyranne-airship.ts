import { registerScript } from '../registry'
import { alliedMinion } from './minion-helpers'

// 'Airborne, Movement +2 / May carry any number of allied minions.'
registerScript('Zephyranne Airship', {
  carryUnits: { capacity: 'any', filter: alliedMinion },
})

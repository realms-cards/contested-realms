import { registerScript } from '../registry'
import { alliedMinion } from './minion-helpers'

// 'May carry any number of allied minions.'
registerScript('Beast of Burden', {
  carryUnits: { capacity: 'any', filter: alliedMinion },
})

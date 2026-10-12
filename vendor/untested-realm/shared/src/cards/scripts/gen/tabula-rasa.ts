import { registerScript } from '../registry'

// ---------------------------------------------------------- Tabula Rasa ----
// 'May be cast to any minion. / Bearer is silenced, can't be modified
//  otherwise, and can't drop Tabula Rasa.'
registerScript('Tabula Rasa', {
  conjureToEnemy: true,
  bearerUnmodifiable: true,
  cantDrop: true,
  silencesUnit: (_state, selfId, unit) => unit.carrying.includes(selfId),
})

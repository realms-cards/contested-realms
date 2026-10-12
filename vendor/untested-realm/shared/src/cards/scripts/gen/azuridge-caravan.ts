import { registerScript } from '../registry'
import { allCards } from '../../db'

// 'Has all elements and minion types.'
let ALL_TYPES: string[] | null = null

let ALL_ELEMENTS: string[] | null = null

registerScript('Azuridge Caravan', {
  selfSubtypes: () => {
    ALL_TYPES ??= [...new Set(allCards.filter((c) => c.type === 'Minion').flatMap((c) => c.subtypes))]
    return ALL_TYPES
  },
  selfElements: () => {
    ALL_ELEMENTS ??= [...new Set(allCards.flatMap((c) => c.elements))]
    return ALL_ELEMENTS
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { courtActive } from './courts'

// 'Elite spells cost an additional (1) to cast, and Uniques (2).'
registerScript('Court of Equity', {
  costModifier: (state, sourceId, _caster, cardName) => {
    if (!courtActive(state, sourceId)) return 0
    const r = getCard(cardName).rarity
    return r === 'Unique' ? 2 : r === 'Elite' ? 1 : 0
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { tutorCont, tutorFromSpellbook } from '../multi-card-utils/tutor-from-spellbook'

// 'Search your spellbook for an Exceptional Mortal, reveal it, and put it into your hand.'
registerScript('Call to War', {
  onCast: (ctx) => tutorFromSpellbook(ctx, 'Choose an Exceptional Mortal', (n) => {
    const d = getCard(n)
    return d.rarity === 'Exceptional' && d.subtypes.includes('Mortal')
  }),
  conts: { tutorPick: tutorCont() },
})

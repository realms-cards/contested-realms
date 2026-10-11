import { registerScript } from '../registry'
import { getCard } from '../../db'
import { tutorCont, tutorFromSpellbook } from '../multi-card-utils/tutor-from-spellbook'

// 'Genesis â†’ Search your spellbook for an artifact that costs â‘  or less, reveal
// it, and put it into your hand. Shuffle.'
registerScript('Highland Princess', {
  genesis: (ctx) => tutorFromSpellbook(ctx, 'Choose an artifact costing â‘  or less', (n) => {
    const d = getCard(n)
    return d.type === 'Artifact' && (d.cost ?? 99) <= 1
  }),
  conts: { tutorPick: tutorCont() },
})

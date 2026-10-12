import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, loseLife } from '../../../engine/effects'
import { courtActive } from './courts'

// 'Players lose 1 life whenever they cast an Elite spell, and 2 for Uniques.'
registerScript('Mobbed Court', {
  onSpellCast: (ctx, by, cardName) => {
    if (!courtActive(ctx.state, ctx.sourceId)) return
    const r = getCard(cardName).rarity
    const loss = r === 'Unique' ? 2 : r === 'Elite' ? 1 : 0
    if (loss) {
      loseLife(ctx.state, by, loss)
      pushLog(ctx.state, by, `The Mobbed Court bays for blood — ${loss} life lost.`)
    }
  },
})

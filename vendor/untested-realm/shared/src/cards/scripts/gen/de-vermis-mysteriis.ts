import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'Spellcaster bearer may cast minion spells for (5), ignoring threshold.' —
// a stance the bearer toggles; while reading, your minion spells cost 5 flat.
registerScript('De Vermis Mysteriis', {
  abilities: [{
    key: 'read',
    label: 'Open / close the worm-book (minions cost ⑤ flat, no threshold)',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      if (art.counters?.reading) {
        delete art.counters.reading
        pushLog(ctx.state, ctx.controller, 'The dread book slams shut.')
      } else {
        art.counters = { ...art.counters, reading: 1 }
        pushLog(ctx.state, ctx.controller, 'The pages whisper of crawling things…')
      }
    },
  }],
  costModifier: (state, sourceId, caster, cardName) => {
    const art = state.artifacts[sourceId]
    if (!art?.counters?.reading || art.carriedBy !== caster.id) return 0
    const def = getCard(cardName)
    return def.type === 'Minion' ? 5 - (def.cost ?? 0) : 0
  },
  grantsNoThreshold: (state, artifactId, cardId) => {
    const art = state.artifacts[artifactId]
    if (!art?.counters?.reading) return false
    return getCard(state.cards[cardId]?.name ?? '').type === 'Minion'
  },
})

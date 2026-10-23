import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, returnToDeck } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'
import { shuffleDeck } from '../../../engine/knowledge'
import { payZoneToll } from '../../../engine/statics'

// 'Shuffle any number of Unique cards from your cemetery into your decks. Draw a card.'
// "any number" → the caster picks which (none is fine); only then the draw.
registerScript('Pendragon Legacy', {
  onCast: (ctx) => {
    const uniques = ctx.state.players[ctx.controller].cemetery.filter((id) => getCard(ctx.state.cards[id].name).rarity === 'Unique')
    if (!uniques.length) return ctx.drawCard(ctx.controller)
    ctx.ask(
      { kind: 'chooseCards', title: 'Shuffle which Unique cards back into your decks? (any number)', data: { cards: uniques.map((id) => ctx.state.cards[id].name), pick: uniques.length, upTo: true } },
      'legacy',
      { uniques },
    )
  },
  conts: {
    legacy: (ctx, c, choice) => {
      const uniques = c.uniques as string[]
      const picked = [...new Set((Array.isArray(choice) ? choice : []).filter((i): i is number => typeof i === 'number'))]
        .map((i) => uniques[i])
        .filter((id): id is string => !!id && ctx.state.players[ctx.controller].cemetery.includes(id))
      // the shuffle-back is cemetery access (Bureau of Occult Control), paid only if something is taken;
      // unpaid → only the draw happens
      if (picked.length && !payZoneToll(ctx.state, ctx.controller)) ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
      else if (picked.length) shuffleBack(ctx, picked)
      ctx.drawCard(ctx.controller)
    },
  },
})

function shuffleBack(ctx: EffectAPI, ids: string[]): void {
  const p = ctx.state.players[ctx.controller]
  const owners = new Set<PlayerId>()
  p.cemetery = p.cemetery.filter((id) => !ids.includes(id))
  for (const id of ids) owners.add(returnToDeck(ctx.state, id)) // each card to its OWNER's deck, never the opponent's
  for (const o of owners) {
    shuffleDeck(ctx.state, ctx.state.players[o].id, 'spellbook')
    shuffleDeck(ctx.state, ctx.state.players[o].id, 'atlas')
  }
  pushLog(ctx.state, ctx.controller, `${ids.length} Unique legacy card(s) return to the decks.`)
}

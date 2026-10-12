import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, returnToDeck } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'
import type { PlayerId } from '../../../engine/types'

// 'Shuffle any number of Unique cards from your cemetery into your decks. Draw a card.'
registerScript('Pendragon Legacy', {
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const owners = new Set<PlayerId>()
    let moved = 0
    p.cemetery = p.cemetery.filter((id) => {
      if (getCard(ctx.state.cards[id].name).rarity === 'Unique') {
        owners.add(returnToDeck(ctx.state, id)) // each card to its OWNER's deck, never the opponent's
        moved++
        return false
      }
      return true
    })
    for (const o of owners) {
      ctx.state.seed = shuffleWithSeed(ctx.state.players[o].spellbook, ctx.state.seed)
      ctx.state.seed = shuffleWithSeed(ctx.state.players[o].atlas, ctx.state.seed)
    }
    if (moved) pushLog(ctx.state, ctx.controller, `${moved} Unique legacy card(s) return to the decks.`)
    ctx.drawCard(ctx.controller)
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'You may discard a random card rather than pay this spell's mana cost.'
// (automated as: if your hand has cards, you may choose at cast time — modeled
// as a Genesis ask that refunds the mana in exchange for the discard)
registerScript('Aramos Mercenaries', {
  genesis: (ctx) => {
    if (ctx.state.players[ctx.controller].hand.length === 0) return
    ctx.ask({ kind: 'yesNo', title: 'Discard a random card to refund the Mercenaries\' cost?' }, 'barter')
  },
  conts: {
    barter: (ctx, _c, choice) => {
      if (!choice) return
      ctx.discardRandom(ctx.controller)
      ctx.state.players[ctx.controller].mana += getCard('Aramos Mercenaries').cost ?? 0
    },
  },
})

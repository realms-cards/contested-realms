import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'
import { askBanishFromCemetery, resolveBanishFromCemetery } from './cemetery-choose'

// 'Banish this coin → Gain (1), or banish up to three cards from any cemetery.'
registerScript("Ferryman's Coin", {
  abilities: [{
    key: 'toll',
    label: 'Banish the coin → mana or grave-hate',
    cost: {},
    effect: (ctx) => {
      ctx.ask({ kind: 'chooseOption', title: "The Ferryman's price:", data: { options: ['gain ①', 'banish 3 from a cemetery'] } }, 'pay')
    },
  }],
  conts: {
    pay: (ctx, _c, choice) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      if (!art) return
      // banish the coin itself
      if (art.carriedBy) {
        const carrier = ctx.state.units[art.carriedBy]
        if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
      }
      const card = ctx.state.cards[art.cardId]
      if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
      delete ctx.state.artifacts[art.id]
      if (choice === 'gain ①') {
        ctx.state.players[ctx.controller].mana += 1
      } else {
        ctx.ask({ kind: 'chooseOption', title: 'Which cemetery?', data: { options: ['yours', "opponent's"] } }, 'ferry')
      }
    },
    ferry: (ctx, _c, choice) => {
      const pid = (choice === 'yours' ? ctx.controller : 1 - ctx.controller) as PlayerId
      // "up to three" — the player chooses which (and how many) to banish
      if (!askBanishFromCemetery(ctx, pid, 3, true, 'ferried')) pushLog(ctx.state, ctx.controller, 'That cemetery is empty.')
    },
    ferried: (ctx, c, choice) => {
      const banished = resolveBanishFromCemetery(ctx, c, choice)
      pushLog(ctx.state, ctx.controller, `${banished.length} soul(s) ferried from ${ctx.state.players[c.pid as PlayerId].name}'s cemetery.`)
    },
  },
})

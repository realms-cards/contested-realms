import { registerScript } from '../registry'
import { pushLog, opponent, returnToDeck } from '../../../engine/effects'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'Return up to three cards from a cemetery to the bottom of their decks. Draw a spell.'
registerScript('Return to Nature', {
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'Whose cemetery returns to nature?', data: { options: ['yours', "your opponent's"] } }, 'whose')
  },
  conts: {
    whose: (ctx, _c, choice) => {
      const who = choice === 'yours' ? ctx.controller : opponent(ctx.controller)
      if (cemeteryProtected(ctx.state, who, ctx.controller)) {
        pushLog(ctx.state, ctx.controller, 'Wormelow Tump seals that cemetery shut.')
        ctx.draw(ctx.controller, 'spellbook')
        return
      }
      const cem = ctx.state.players[who].cemetery
      if (!cem.length) {
        ctx.draw(ctx.controller, 'spellbook')
        return
      }
      ctx.ask(
        { kind: 'chooseCards', title: 'Return which cards (up to 3)?', data: { cards: cem.map((id) => ctx.state.cards[id].name), pick: 3, upTo: true } },
        'bury',
        { who },
      )
    },
    bury: (ctx, c, choice) => {
      const who = c.who as PlayerId
      const p = ctx.state.players[who]
      const idxs = (Array.isArray(choice) ? choice : []).filter((i): i is number => typeof i === 'number').sort((a, b) => b - a)
      // the return is cemetery access (Bureau of Occult Control); unpaid → only the draw happens
      const open = !idxs.length || payZoneToll(ctx.state, ctx.controller)
      if (!open) pushLog(ctx.state, ctx.controller, 'The Bureau of Occult Control demands (2) for cemetery access.')
      for (const i of open ? idxs.slice(0, 3) : []) {
        const [id] = p.cemetery.splice(i, 1)
        if (id === undefined) continue
        returnToDeck(ctx.state, id) // always to the OWNER's deck, never the cemetery-holder's
      }
      ctx.draw(ctx.controller, 'spellbook')
    },
  },
})

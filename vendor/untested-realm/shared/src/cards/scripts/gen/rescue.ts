import { registerScript } from '../registry'
import { getCard } from '../../db'
import { payZoneToll } from '../../../engine/statics'

// 'Return a minion from your cemetery to your hand.'
registerScript('Rescue', {
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const minions = p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion')
    if (!minions.length) return ctx.log('No minions to rescue.')
    if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
    ctx.ask(
      { kind: 'chooseCards', title: 'Rescue which minion?', data: { cards: minions.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
      'rescue',
      { minions },
    )
  },
  conts: {
    rescue: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const id = (c.minions as string[])[idx]
      const p = ctx.state.players[ctx.controller]
      const at = p.cemetery.indexOf(id)
      if (at >= 0) {
        p.cemetery.splice(at, 1)
        p.hand.push(id)
      }
    },
  },
})

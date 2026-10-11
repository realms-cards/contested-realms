import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'As an additional cost to cast this, you may banish a dead Knight, Sir, or
//  Dame. If you do, Vengeful Heir is summoned as a copy of that minion.'
registerScript('Vengeful Heir', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const knights = p.cemetery.filter((id) => {
      const n = ctx.state.cards[id].name
      return getCard(n).type === 'Minion' && (/\b(Knight|Sir|Dame)\b/.test(n) || getCard(n).subtypes.includes('Knight'))
    })
    if (!knights.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Avenge whom? (skip to remain the Heir)', data: { cards: knights.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'avenge',
      { knights },
    )
  },
  conts: {
    avenge: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const cardId = (c.knights as string[])[idx]
      const self = ctx.state.units[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!self || !p.cemetery.includes(cardId)) return
      p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
      p.banished.push(cardId)
      self.name = ctx.state.cards[cardId].name
      self.damage = 0
      pushLog(ctx.state, ctx.controller, `The Heir takes up the mantle of ${self.name}!`)
    },
  },
})

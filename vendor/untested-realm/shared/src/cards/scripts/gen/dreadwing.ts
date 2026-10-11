import { registerScript } from '../registry'
import { toCemetery } from '../../../engine/effects'

// 'Airborne / Genesis → Strikes your Avatar unless you discard a card.'
registerScript('Dreadwing', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const names = [...new Set(p.hand.map((id) => ctx.state.cards[id].name))]
    ctx.ask(
      { kind: 'chooseOption', title: 'Dreadwing hungers: discard a card, or let it strike your Avatar?', data: { options: [...names, '(let it strike)'] } },
      'feed',
    )
  },
  conts: {
    feed: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (choice && choice !== '(let it strike)') {
        const idx = p.hand.findIndex((id) => ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [id] = p.hand.splice(idx, 1)
          toCemetery(ctx.state, id)
          return
        }
      }
      const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
      if (self && avatar) ctx.strike(self, { unit: avatar.id })
    },
  },
})

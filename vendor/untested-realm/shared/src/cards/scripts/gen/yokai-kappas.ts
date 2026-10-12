import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, toCemetery } from '../../../engine/effects'

// 'Discard a water site → Untap Yokai Kappas. Use only once per turn.'
registerScript('Yokai Kappas', {
  abilities: [{
    key: 'slurp',
    label: 'Discard a water site → Untap',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      const waters = p.hand.filter((id) => {
        const def = getCard(ctx.state.cards[id].name)
        return def.type === 'Site' && def.thresholds.water > 0
      })
      if (!waters.length) return ctx.log('No water site in hand.')
      ctx.ask({ kind: 'chooseCards', title: 'Offer which water site to the Kappas?', data: { cards: waters.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } }, 'slurp', { waters })
    },
  }],
  conts: {
    slurp: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const id = (c.waters as string[])[idx]
      const p = ctx.state.players[ctx.controller]
      const at = p.hand.indexOf(id)
      if (at < 0) return
      p.hand.splice(at, 1)
      toCemetery(ctx.state, id)
      const self = ctx.state.units[ctx.sourceId]
      if (self) self.tapped = false
      pushLog(ctx.state, ctx.controller, 'The Kappas refill their head-bowls and perk up.')
    },
  },
})

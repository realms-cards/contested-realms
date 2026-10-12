import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → You may pay (1) to conjure a Lance token here.'
registerScript('Forge', {
  genesis: (ctx) => {
    if (ctx.state.players[ctx.controller].mana < 1) return
    ctx.ask({ kind: 'yesNo', title: 'Pay ① to forge a Lance here?' }, 'forge')
  },
  conts: {
    forge: (ctx, _c, choice) => {
      const self = ctx.state.sites[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!choice || !self || p.mana < 1) return
      ctx.spendMana(ctx.controller, 1)
      const cardId = `c${ctx.state.nextId++}`
      ctx.state.cards[cardId] = { id: cardId, name: 'Lance', owner: ctx.controller, isToken: true }
      const artId = `a${ctx.state.nextId++}`
      ctx.state.artifacts[artId] = {
        id: artId, cardId, name: 'Lance', conjuredBy: ctx.controller,
        x: self.x, y: self.y, region: 'surface', carriedBy: null, tapped: false,
      }
      pushLog(ctx.state, ctx.controller, 'A Lance gleams on the anvil.')
    },
  },
})

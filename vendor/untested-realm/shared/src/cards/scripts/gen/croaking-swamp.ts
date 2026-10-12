import { registerScript } from '../registry'

registerScript('Croaking Swamp', {
  genesis: (ctx) => {
    if (ctx.state.players[ctx.controller].mana < 1) return
    ctx.ask({ kind: 'yesNo', title: 'Pay ① to summon a Frog here?' }, 'frog')
  },
  conts: {
    frog: (ctx, _c, choice) => {
      const self = ctx.state.sites[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!choice || !self || p.mana < 1) return
      ctx.spendMana(ctx.controller, 1)
      ctx.summonToken('Frog', ctx.controller, self.x, self.y)
    },
  },
})

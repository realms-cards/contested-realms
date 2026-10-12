import { registerScript } from '../registry'

// village/swamp variants
registerScript('Common Village', {
  genesis: (ctx) => {
    if (ctx.state.players[ctx.controller].mana < 1) return
    ctx.ask({ kind: 'yesNo', title: 'Pay ① to summon a Foot Soldier here?' }, 'fs')
  },
  conts: {
    fs: (ctx, _c, choice) => {
      const self = ctx.state.sites[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!choice || !self || p.mana < 1) return
      ctx.spendMana(ctx.controller, 1)
      ctx.summonToken('Foot Soldier', ctx.controller, self.x, self.y)
    },
  },
})

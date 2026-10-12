import { type EffectAPI } from '../registry'

// 'Genesis → You may pay (1) to summon a Skeleton token here.'
export const boneyardSite = {
  genesis: (ctx: EffectAPI) => {
    if (ctx.state.players[ctx.controller].mana < 1) return
    ctx.ask({ kind: 'yesNo' as const, title: 'Pay ① to summon a Skeleton here?' }, 'bones')
  },
  conts: {
    bones: (ctx: EffectAPI, _c: any, choice: any) => {
      const self = ctx.state.sites[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!choice || !self || p.mana < 1) return
      ctx.spendMana(ctx.controller, 1)
      ctx.summonToken('Skeleton', ctx.controller, self.x, self.y)
    },
  },
}

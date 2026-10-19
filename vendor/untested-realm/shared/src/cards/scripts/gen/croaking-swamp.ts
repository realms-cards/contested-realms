import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite } from '../../../engine/grid'

// The Frog has Submerge, so at a water site it may arrive underwater — the same choice a cast minion
// with Submerge gets (casting.ts) — and the summon asks where.
const SURFACE = 'On the surface'
const SUBMERGED = 'Submerged'

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
      if (isWaterSite(ctx.state, self, getCard)) {
        ctx.ask({ kind: 'chooseOption', title: 'Summon the Frog where?', data: { options: [SURFACE, SUBMERGED] } }, 'region')
        return
      }
      ctx.spendMana(ctx.controller, 1)
      ctx.summonToken('Frog', ctx.controller, self.x, self.y)
    },
    region: (ctx, _c, choice) => {
      const self = ctx.state.sites[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!self || p.mana < 1) return
      ctx.spendMana(ctx.controller, 1)
      ctx.summonToken('Frog', ctx.controller, self.x, self.y, choice === SUBMERGED ? 'underwater' : 'surface')
    },
  },
})

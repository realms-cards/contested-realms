import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'
import { takeControl } from '../multi-card-utils/take-control'

// "Whenever this enters another player's site, you may give them the Peace
//  Offering. If you do, their units can't attack you on their next turn."
registerScript('Peace Offering', {
  onUnitEntersSquare: (ctx, moved) => {
    if (moved.id !== ctx.sourceId) return
    const site = siteAt(ctx.state, moved.x, moved.y)
    if (!site || site.controller === null || site.controller === ctx.controller) return
    ctx.ask({ kind: 'yesNo', title: `Gift the Peace Offering to ${ctx.state.players[site.controller].name}?` }, 'gift', { to: site.controller })
  },
  conts: {
    gift: (ctx, c, yes) => {
      if (!yes) return
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const to = c.to as PlayerId
      const from = ctx.controller
      if (!takeControl(ctx.state, self, to)) return // King Arthur: no gift, so no truce
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.peaceTruce = [...(ctx.state.flow.peaceTruce ?? []), { bound: to, protectedPlayer: from, turn: ctx.state.turn }]
      pushLog(ctx.state, from, `The Peace Offering changes hands — ${ctx.state.players[to].name} is honor-bound not to attack next turn.`)
    },
  },
})

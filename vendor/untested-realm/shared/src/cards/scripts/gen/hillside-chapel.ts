import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { wardUnit } from '../../../engine/effects'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Genesis → You may pay (1) to tap and Ward a nearby allied minion.'
registerScript('Hillside Chapel', {
  genesis: (ctx) => {
    if (ctx.state.players[ctx.controller].mana < 1) return
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const candidates = nearbySquaresW(ctx.state, self.x, self.y)
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y))
      .filter((u) => !u.isAvatar && u.controller === ctx.controller && !isEvilU(ctx.state, u))
      .map((u) => u.id)
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Pay ① to tap & Ward which minion?', data: { candidates, count: 1, upTo: true, kind: 'unit' } }, 'chapel')
  },
  conts: {
    chapel: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = id ? ctx.state.units[id] : null
      const p = ctx.state.players[ctx.controller]
      if (!u || p.mana < 1) return
      ctx.spendMana(ctx.controller, 1)
      u.tapped = true
      wardUnit(ctx.state, u)
    },
  },
})

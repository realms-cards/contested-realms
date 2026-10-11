import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'At the start of your turn, tap target nearby enemy.'
registerScript('Tooth Faeries', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // "nearby enemy" is region-locked to the Faeries' own region (rulebook: a nearby
    // minion/enemy cannot cross a regional boundary) — an underground/underwater/void
    // enemy is NOT nearby a surface Faerie. (Enemy avatars ARE valid targets.)
    const prey = nearbySquaresW(ctx.state, self.x, self.y)
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => u.controller !== ctx.controller)
      .map((u) => u.id)
    if (!prey.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Tooth Faeries pester whom?', data: { candidates: prey, count: 1, upTo: true, kind: 'unit' } }, 'pester')
  },
  conts: {
    pester: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (u) u.tapped = true
    },
  },
})

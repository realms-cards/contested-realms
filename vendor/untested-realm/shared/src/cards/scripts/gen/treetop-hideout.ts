import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Genesis → You may give Stealth to a nearby allied minion.'
registerScript('Treetop Hideout', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const allies = nearbySquaresW(ctx.state, self.x, self.y)
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y))
      .filter((u) => u.controller === ctx.controller && !u.isAvatar && !u.stealth)
      .map((u) => u.id)
    if (!allies.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'Who hides in the treetops? (skip for none)', data: { candidates: allies, count: 1, upTo: true, kind: 'unit' } }, 'hide')
  },
  conts: {
    hide: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (u) u.stealth = true
    },
  },
})

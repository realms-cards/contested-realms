import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { selfStepsCloser } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'

// (Grey Wolves scripted in m7, where the pack also counts the Talagelum.)

// 'Submerge / At the start of your turn, force target nearby enemy minion to take
// a step toward Guile Sirens.'
registerScript('Guile Sirens', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const candidates = nearbySquaresW(ctx.state, self.x, self.y)
      .flatMap((s) => unitsAt(ctx.state, s.x, s.y, self.region))
      .filter((u) => u.controller !== ctx.controller && !u.isAvatar && !u.stealth)
      .map((u) => u.id)
    if (!candidates.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Sirens sing -- lure which enemy closer?', data: { candidates, count: 1, kind: 'unit' } }, 'lure')
  },
  conts: {
    lure: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const u = id ? ctx.state.units[id] : null
      if (!self || !u) return
      const options = selfStepsCloser(ctx.state, u, self)
      if (options.length === 0) return
      if (options.length === 1) { ctx.teleport(u.id, options[0].x, options[0].y, u.region); checkStateBased(ctx.state); return }
      // several legal closer steps â†’ the EFFECT's controller chooses (Coy Nixie rule)
      ctx.ask({ kind: 'chooseSquare', title: `Guile Sirens -- step ${u.name} closer (choose a direction)`, data: { squares: options.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller }, 'sirenStep', { victim: u.id })
    },
    sirenStep: (ctx, c: any, choice: any) => {
      const u = ctx.state.units[c.victim as string]
      if (!u || !choice || typeof choice.x !== 'number') return
      ctx.teleport(u.id, choice.x, choice.y, u.region)
      checkStateBased(ctx.state)
    },
  },
})

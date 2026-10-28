import { registerScript } from '../registry'
import { selfStepsCloser, takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'

// 'Genesis → Tap target adjacent enemy minion and make it step closer.'
registerScript('Mesmer Demon', {
  genesisTargets: [{ what: 'minion', count: 1, upTo: true, targeted: true, where: 'adjacent', owner: 'enemy', label: 'target adjacent enemy minion' }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    u.tapped = true
    const options = selfStepsCloser(ctx.state, u, self) // "step closer" (def. 2)
    if (options.length === 0) return
    if (options.length === 1) { takeOwnStep(ctx.state, u, options[0], ctx.controller); checkStateBased(ctx.state); return }
    // several legal closer steps → the EFFECT's controller chooses (Coy Nixie rule)
    ctx.ask({ kind: 'chooseSquare', title: `Mesmer Demon — step ${u.name} closer (choose a direction)`, data: { squares: options.map((s) => ({ x: s.x, y: s.y })) }, player: ctx.controller }, 'mesmerStep', { victim: u.id })
  },
  conts: {
    mesmerStep: (ctx, c: any, choice: any) => {
      const u = ctx.state.units[c.victim as string]
      const self = ctx.state.units[ctx.sourceId]
      if (!u || !self || !choice || typeof choice.x !== 'number') return
      const step = selfStepsCloser(ctx.state, u, self).find((s) => s.x === choice.x && s.y === choice.y)
      if (step) takeOwnStep(ctx.state, u, step, ctx.controller)
      checkStateBased(ctx.state)
    },
  },
})

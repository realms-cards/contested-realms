import { registerScript } from '../registry'
import { takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'
import { ownSteps, ownStepTo } from '../multi-card-utils/own-step'

// 'An allied minion takes a step. / You may cast this from your cemetery,
//  banishing it afterward.'
// Its own step (Codex, Step def. 2): any legal step its abilities allow — Airborne diagonally,
// Voidwalk into a void, Burrowing / Submerge up or down at its own square. Immobile → no step.
registerScript('Second Wind', {
  castFromCemetery: { banishAfter: true },
  targets: [{ what: 'minion', count: 1, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    const steps = ownSteps(ctx.state, u)
    if (!steps.length) return ctx.log(`${u.name} can't take a step.`)
    ctx.ask({ kind: 'chooseSquare', title: `${u.name} finds a second wind — step where?`, data: { squares: steps.map((s) => ({ x: s.x, y: s.y })) } }, 'stride', { unitId: u.id })
  },
  conts: {
    stride: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (!u) return
      const step = ownStepTo(ctx.state, u, sq)
      if (step) takeOwnStep(ctx.state, u, step)
      checkStateBased(ctx.state)
    },
  },
})

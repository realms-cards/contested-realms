import { registerScript, type EffectAPI } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { takeOwnStep } from '../../../engine/movement'
import { strikeAllSimultaneous } from '../../../engine/effects'
import { ownSteps, ownStepTo } from '../multi-card-utils/own-step'

// 'Airborne, Ward / Genesis → Michael takes a step, then strikes all enemies at his location.'
// "Takes a step" is mandatory, and his own step (Codex, Step def. 2): any legal step — Airborne, so
// surface diagonals too; walls / entry-bans / Immobile still block him. The step isn't "target"-worded,
// so it is a square pick, not a site target (which would break a warded site's Ward).
registerScript('Archangel Michael', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const steps = ownSteps(ctx.state, self)
    if (!steps.length) return michaelSmite(ctx)
    if (steps.length === 1) { takeOwnStep(ctx.state, self, steps[0]); return michaelSmite(ctx) }
    ctx.ask({ kind: 'chooseSquare', title: 'Michael takes a step — to where?', data: { squares: steps.map((s) => ({ x: s.x, y: s.y })) } }, 'step')
  },
  conts: {
    step: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      const step = self ? ownStepTo(ctx.state, self, sq) : undefined
      if (self && step) takeOwnStep(ctx.state, self, step)
      michaelSmite(ctx)
    },
  },
})

function michaelSmite(ctx: EffectAPI) {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const foes = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.controller !== ctx.controller).map((u) => u.id)
  strikeAllSimultaneous(ctx.state, self.id, foes, ctx.controller) // controller chooses strike order
}

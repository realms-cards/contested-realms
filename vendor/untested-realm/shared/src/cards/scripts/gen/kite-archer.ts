import { registerScript, type EffectAPI } from '../registry'
import { takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'
import { mayStepSquares, mayStepOption, ownSteps, readMayStep } from '../multi-card-utils/own-step'
import type { Step } from '../../../engine/types'

// 'Ranged / Immediately after performing a ranged strike, Kite Archer may take a step.'
// Its own step (Codex, Step def. 2): any legal step its abilities allow, not just an orthogonal one.
registerScript('Kite Archer', {
  afterRangedStrike: (ctx, self) => {
    if (!ownSteps(ctx.state, self).length) return
    // "MAY take a step" — its own square is offered so you can stay put (the step is optional).
    ctx.ask({ kind: 'chooseSquare', title: 'Kite Archer skips away — step where? (its square to stay)', data: { squares: mayStepSquares(ctx.state, self) } }, 'kite')
  },
  conts: {
    kite: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = readMayStep(ctx, self, sq, 'kiteVertical')
      if (typeof step === 'object') kite(ctx, step)
    },
    kiteVertical: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = mayStepOption(ctx.state, self, choice)
      if (step !== 'stay') kite(ctx, step)
    },
  },
})

function kite(ctx: EffectAPI, step: Step): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  takeOwnStep(ctx.state, self, step)
  checkStateBased(ctx.state)
}

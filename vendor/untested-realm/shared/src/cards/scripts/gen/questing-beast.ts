import { registerScript, type EffectAPI } from '../registry'
import { takeOwnStep } from '../../../engine/movement'
import { checkStateBased } from '../../../engine/effects'
import { mayStepSquares, mayStepOption, ownSteps, readMayStep } from '../multi-card-utils/own-step'
import type { Step } from '../../../engine/types'

// 'At the end of your turn, Questing Beast may take a step.'
// Its own step (Codex, Step def. 2): any legal step its abilities allow, not just an orthogonal one.
registerScript('Questing Beast', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !ownSteps(ctx.state, self).length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The Questing Beast slips away — step where? (its square to stay)', data: { squares: mayStepSquares(ctx.state, self) } }, 'quest')
  },
  conts: {
    quest: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = readMayStep(ctx, self, sq, 'questVertical')
      if (typeof step === 'object') quest(ctx, step)
    },
    questVertical: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = mayStepOption(ctx.state, self, choice)
      if (step !== 'stay') quest(ctx, step)
    },
  },
})

function quest(ctx: EffectAPI, step: Step): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  takeOwnStep(ctx.state, self, step)
  checkStateBased(ctx.state)
}

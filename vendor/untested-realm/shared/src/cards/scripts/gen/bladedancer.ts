import { registerScript, type EffectAPI } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { takeOwnStep } from '../../../engine/movement'
import { beginAttack } from '../../../engine/combat'
import { mayStepSquares, mayStepOption, ownSteps, readMayStep } from '../multi-card-utils/own-step'
import type { Step } from '../../../engine/types'

// 'After her first attack each turn, Bladedancer may take a step. When she does,
//  she may attack a unit there.'
// Her own step (Codex, Step def. 2): any legal step her abilities allow (Airborne diagonals…).
registerScript('Bladedancer', {
  afterAttack: (ctx, attacker) => {
    const flow = (ctx.state.flow = ctx.state.flow ?? {})
    if (flow.bladeStep?.[ctx.controller] === ctx.state.turn) return
    flow.bladeStep = { ...(flow.bladeStep ?? {}), [ctx.controller]: ctx.state.turn }
    if (!ownSteps(ctx.state, attacker).length) return
    // "MAY take a step" — her own square is offered so she can stay put
    ctx.ask({ kind: 'chooseSquare', title: 'Bladedancer dances onward — step where? (her square to stay)', data: { squares: mayStepSquares(ctx.state, attacker) } }, 'step')
  },
  conts: {
    step: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = readMayStep(ctx, self, sq, 'stepVertical')
      if (typeof step === 'object') dance(ctx, step)
    },
    stepVertical: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = mayStepOption(ctx.state, self, choice)
      if (step !== 'stay') dance(ctx, step)
    },
    slash: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof id !== 'string' || !ctx.state.units[id]) return
      beginAttack(ctx.state, self, { unit: id })
    },
  },
})

/** she takes the step; "when she does, she may attack a unit there" */
function dance(ctx: EffectAPI, step: Step): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self || !takeOwnStep(ctx.state, self, step)) return
  const now = ctx.state.units[self.id]
  if (!now) return
  const prey = unitsAt(ctx.state, now.x, now.y, now.region).filter((u) => u.controller !== ctx.controller && !u.stealth)
  if (!prey.length) return
  ctx.ask(
    { kind: 'chooseTargets', title: 'Whirling blades — attack which unit here?', data: { candidates: prey.map((u) => u.id), count: 1, upTo: true, kind: 'unit' } },
    'slash',
  )
}

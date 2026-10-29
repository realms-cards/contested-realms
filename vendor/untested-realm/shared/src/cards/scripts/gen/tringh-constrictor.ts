import { registerScript, type EffectAPI } from '../registry'
import { pushLog, killUnit, checkStateBased } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { takeOwnStep } from '../../../engine/movement'
import { mayStepSquares, mayStepOption, readMayStep } from '../multi-card-utils/own-step'

// 'Tap → Tringh Constrictor may take a step, then it constricts target minion
//  here and carries it disabled. The next time it would untap, it instead kills
//  that minion if it's still constricted.'
registerScript('Tringh Constrictor', {
  carriedAreDisabled: true,
  abilities: [{
    key: 'constrict',
    label: 'Slither & constrict a minion',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      // its own step (Codex, Step def. 2): any legal step its abilities allow
      ctx.ask({ kind: 'chooseSquare', title: 'The Constrictor slithers where? (its square to stay)', data: { squares: mayStepSquares(ctx.state, self) } }, 'slither')
    },
  }],
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !self.tapped || !self.counters?.constricting) return
    const preyId = `u${self.counters.constricting}`
    const prey = ctx.state.units[preyId]
    if (prey && prey.carriedBy === self.id) {
      pushLog(ctx.state, ctx.controller, `The Constrictor squeezes the life from ${prey.name}.`)
      killUnit(ctx.state, prey.id)
      checkStateBased(ctx.state)
    }
    delete self.counters.constricting
    self.tapped = true
    self.counters = { ...self.counters, skipUntap: 0 } // consume next-turn kill cycle
  },
  conts: {
    slither: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = readMayStep(ctx, self, sq, 'slitherVertical')
      if (step === 'asked') return
      if (step !== 'stay') takeOwnStep(ctx.state, self, step)
      constrict(ctx)
    },
    slitherVertical: (ctx, _c, choice) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const step = mayStepOption(ctx.state, self, choice)
      if (step !== 'stay') takeOwnStep(ctx.state, self, step)
      constrict(ctx)
    },
    squeeze: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const prey = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !prey) return
      prey.carriedBy = self.id
      self.carryingUnits = [...(self.carryingUnits ?? []), prey.id]
      self.counters = { ...self.counters, constricting: Number(prey.id.slice(1)), skipUntap: 1 }
      pushLog(ctx.state, ctx.controller, `The Constrictor coils around ${prey.name}.`)
    },
  },
})

/** "then it constricts target minion here" */
function constrict(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const prey = unitsAt(ctx.state, self.x, self.y, self.region).filter((u) => u.id !== self.id && !u.isAvatar).map((u) => u.id)
  if (!prey.length) return
  ctx.ask({ kind: 'chooseTargets', title: 'Constrict which minion here?', data: { candidates: prey, count: 1, upTo: true, kind: 'unit' } }, 'squeeze')
}

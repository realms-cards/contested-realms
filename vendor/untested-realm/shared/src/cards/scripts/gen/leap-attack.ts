import { registerScript, type EffectAPI } from '../registry'
import { strikeAllSimultaneous } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { takeOwnStep } from '../../../engine/movement'
import { mayStepSquares, mayStepOption, ownSteps, readMayStep } from '../multi-card-utils/own-step'

// 'An ally may take a step, and then it strikes each enemy at its location.'
// Its own step (Codex, Step def. 2): "Leap Attack … could allow a Burrowed minion to unburrow to the
// surface and strike all the units there"; Airborne may leap diagonally. Codex (Immobile): "An Immobile
// unit couldn't take any steps with Leap Attack but it could still strike."
registerScript('Leap Attack', {
  // "an ally" — not "an allied minion" — so it works with your Avatar too
  targets: [{ what: 'unit', count: 1, targeted: false, owner: 'ally', label: 'an ally' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const ally = ctx.state.units[t.unit]
    if (!ally) return
    if (!ownSteps(ctx.state, ally).length) return leapStrike(ctx, ally.id)
    ctx.ask({ kind: 'chooseSquare', title: `${ally.name} leaps where? (its own square to stay)`, data: { squares: mayStepSquares(ctx.state, ally) } }, 'leap', { unitId: ally.id })
  },
  conts: {
    leap: (ctx, c, sq) => {
      const ally = ctx.state.units[c.unitId as string]
      if (!ally) return
      const step = readMayStep(ctx, ally, sq, 'leapVertical', { unitId: ally.id })
      if (step === 'asked') return
      if (step !== 'stay') takeOwnStep(ctx.state, ally, step)
      leapStrike(ctx, ally.id)
    },
    leapVertical: (ctx, c, choice) => {
      const ally = ctx.state.units[c.unitId as string]
      if (!ally) return
      const step = mayStepOption(ctx.state, ally, choice)
      if (step !== 'stay') takeOwnStep(ctx.state, ally, step)
      leapStrike(ctx, ally.id)
    },
  },
})

function leapStrike(ctx: EffectAPI, unitId: string): void {
  const ally = ctx.state.units[unitId]
  if (!ally) return
  const foes = unitsAt(ctx.state, ally.x, ally.y, ally.region).filter((u) => u.controller !== ally.controller).map((u) => u.id)
  strikeAllSimultaneous(ctx.state, ally.id, foes, ctx.controller) // controller chooses strike order
}

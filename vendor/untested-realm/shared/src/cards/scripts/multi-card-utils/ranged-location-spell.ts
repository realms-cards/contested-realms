import { type CardScript, type EffectAPI } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { squaresWithinSteps } from './step-range-targets'
import type { UnitState } from '../../../engine/types'

// A spell that addresses a LOCATION up to `steps` steps from the caster and applies `perUnit` to every
// unit standing there (Minor Explosion → deal 3, Exorcism → banish Demons/Undead, Mortality → kill Mortals).
// "up to N steps away" is step/Manhattan distance (def. 1), wrap-aware — NOT chebyshev. The engine opens a
// damage-event scope around onCast, so effects on the whole location resolve simultaneously (no unit leaves
// the board mid-blast → nearby Shield Maidens keep their aura even when the same hit is lethal to them).
export function rangedLocationSpell(opts: { steps: number; perUnit: (ctx: EffectAPI, u: UnitState) => void }): CardScript {
  const { steps, perUnit } = opts
  return {
    targets: [{ what: 'square', count: 1, targeted: true, label: `target location (≤${steps} steps)` }],
    // engine-authoritative legal set: every square ≤N steps away → the client can't click a far location
    // and castSpell rejects one (see step-range-targets).
    targetOptions: (state, caster) => squaresWithinSteps(state, caster, steps),
    onCast: (ctx) => {
      const t = ctx.targets[0]
      if (!('square' in t)) return
      const c = ctx.caster!
      if (realStepDistanceW(ctx.state, c, t.square) > steps) return ctx.log('Too far away.')
      const region = t.square.region ?? c.region
      for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) perUnit(ctx, u)
    },
  }
}

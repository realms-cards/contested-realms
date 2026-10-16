import { registerScript } from '../registry'
import { realStepDistanceW } from '../../../engine/movement'
import { resolveCaster } from '../../../engine/casting'
import { CROSS_3X3, applyGrid, resolveCells } from '../multi-card-utils/apply-grid'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Target a location up to two steps away. [3 5 3 / 5 7 5 / 3 5 3]'
registerScript('Major Explosion', {
  areaDamage: (state, casterId, params) => {
    // resolve the caster from its id — may be a unit OR a spellcaster ARTIFACT (Omphalos) / site, so the
    // ≤2-step range (and thus the preview) is measured from THERE, not the avatar (player 0 arg is only a
    // last-resort owner fallback, unused for the distance check).
    const caster = resolveCaster(state, casterId, 0)
    if (!caster || !params.at) return null
    if (realStepDistanceW(state, caster, params.at) > 2) return null
    return resolveCells(state, params.at, CROSS_3X3, 'n')
  },
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  // engine-authoritative legal set: every square ≤2 steps away (same bound the areaDamage preview +
  // onCast enforce) — the client can only highlight/click these.
  targetOptions: (state, caster) => squaresWithinSteps(state, caster, 2),
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const caster = ctx.caster!
    if (realStepDistanceW(ctx.state, caster, t.square) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    applyGrid(ctx, t.square, CROSS_3X3, 'n')
  },
})

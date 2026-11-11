import { registerScript } from '../registry'
import { destroyTogether } from '../multi-card-utils/destroy-together'
import { checkStateBased } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { effSubtypes, isArtifactUnit } from '../../../engine/statics'
import { realStepDistanceW } from '../../../engine/movement'
import { squaresWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Destroy all artifacts and Undead minions at a location up to two steps away.'
registerScript('Unravel', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  targetOptions: (state, caster) => squaresWithinSteps(state, caster, 2), // client-blockable range
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('square' in t)) return
    const caster = ctx.caster!
    if (realStepDistanceW(ctx.state, caster, t.square) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    const region = t.square.region ?? caster.region
    // automatons count as artifacts and unravel with the rest (ward-aware)
    destroyTogether(
      ctx,
      unitsAt(ctx.state, t.square.x, t.square.y, region).filter((u) => effSubtypes(ctx.state, u).includes('Undead') || isArtifactUnit(ctx.state, u)).map((u) => u.id),
      Object.values(ctx.state.artifacts).filter((a) => !a.carriedBy && a.x === t.square.x && a.y === t.square.y && a.region === region).map((a) => a.id),
    )
    checkStateBased(ctx.state)
  },
})

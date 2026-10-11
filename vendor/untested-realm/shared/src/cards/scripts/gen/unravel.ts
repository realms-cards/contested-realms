import { registerScript } from '../registry'
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
    for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
      // automatons count as artifacts and unravel with the rest (ward-aware)
      if (!u.isAvatar && (effSubtypes(ctx.state, u).includes('Undead') || isArtifactUnit(ctx.state, u))) ctx.kill(u.id)
    }
    for (const a of Object.values(ctx.state.artifacts)) {
      if (!a.carriedBy && a.x === t.square.x && a.y === t.square.y && a.region === region) ctx.breakArtifact(a.id)
    }
    checkStateBased(ctx.state)
  },
})

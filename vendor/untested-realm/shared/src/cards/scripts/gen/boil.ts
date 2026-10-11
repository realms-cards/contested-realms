import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { sitesWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Destroy all minions occupying target water site up to two steps away.'
registerScript('Boil', {
  targets: [{
    what: 'site', count: 1, targeted: true, label: 'target water site (≤2 steps)',
    filter: (state, site) => isWaterSite(state, site, getCard),
  }],
  // legal set = WATER sites ≤2 steps away (both constraints, so the client highlights only these)
  targetOptions: (state, caster) => sitesWithinSteps(state, caster, 2, (s) => isWaterSite(state, s, getCard)),
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    const caster = ctx.caster!
    if (!site || realStepDistanceW(ctx.state, caster, site) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (!u.isAvatar && (u.region === 'surface' || u.region === 'underwater')) ctx.kill(u.id)
    }
  },
})

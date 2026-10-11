import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { realStepDistanceW } from '../../../engine/movement'
import { sitesWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Target a site up to two steps away. Deal 1 damage to everything atop it,
//  repeating for each site in your hand.'
registerScript('Stone Rain', {
  targets: [{ what: 'site', count: 1, targeted: true, label: 'target site (≤2 steps)' }],
  targetOptions: (state, caster) => sitesWithinSteps(state, caster, 2), // client-blockable range
  onCast: (ctx) => {
    const t = ctx.targets[0]
    const caster = ctx.caster!
    if (!t || !('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site || realStepDistanceW(ctx.state, caster, site) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    const p = ctx.state.players[ctx.controller]
    const reps = 1 + p.hand.filter((id) => getCard(ctx.state.cards[id].name).type === 'Site').length
    for (let i = 0; i < reps; i++) {
      for (const u of unitsAt(ctx.state, site.x, site.y, 'surface')) ctx.dealDamage({ unit: u.id }, 1)
    }
    pushLog(ctx.state, ctx.controller, `Stones rain down ${reps} time(s)!`)
  },
})

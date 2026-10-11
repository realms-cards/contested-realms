import { registerScript } from '../registry'
import { getCard } from '../../db'
import { unitsAt } from '../../../engine/grid'
import { effElements } from '../../../engine/statics'
import { realStepDistanceW } from '../../../engine/movement'
import { pushLog } from '../../../engine/effects'
import { sitesWithinSteps } from '../multi-card-utils/step-range-targets'

// 'Banish all fire minions and fire auras occupying target site up to two steps away.'
registerScript('Extinguish', {
  targets: [{ what: 'site', count: 1, targeted: true, label: 'target site (≤2 steps)' }],
  targetOptions: (state, caster) => sitesWithinSteps(state, caster, 2), // client-blockable range
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('site' in t)) return
    const site = ctx.state.sites[t.site]
    const caster = ctx.caster!
    if (!site || realStepDistanceW(ctx.state, caster, site) > 2) return ctx.log('Too far away.') // "up to two steps away" (def. 1)
    for (const u of unitsAt(ctx.state, site.x, site.y)) {
      if (!u.isAvatar && effElements(ctx.state, u).includes('Fire')) ctx.banish(u.id)
    }
    for (const r of Object.values(ctx.state.auras)) {
      if (getCard(r.name).elements.includes('Fire') && r.squares.some((s) => s.x === site.x && s.y === site.y)) {
        delete ctx.state.auras[r.id] // banished: not to the cemetery
        pushLog(ctx.state, ctx.controller, `${r.name} is extinguished.`)
      }
    }
  },
})

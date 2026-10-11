import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Gargantula may drag an adjacent minion here, disabling it in a
//  cocoon until a unit at its location taps to free it.'
registerScript('Gargantula', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, where: 'adjacent', label: 'an adjacent minion',
  }],
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const t = ctx.targets[0]
    if (!self || !t || !('unit' in t)) return
    const prey = ctx.state.units[t.unit]
    if (!prey) return
    ctx.teleport(prey.id, self.x, self.y, self.region, { push: true }) // forced drag: Cage/push-ban/no-void aware
    prey.disabled = true
    prey.counters = { ...prey.counters, cocooned: 1 }
    pushLog(ctx.state, ctx.controller, `${prey.name} is wrapped in silk!`)
  },
  // The "cut free" ability (a unit sharing the cocoon's location taps to free it) is surfaced by the
  // engine from the `cocooned` counter — see grantedAbilities — so the minion can still be freed even
  // if this Gargantula has since died (the silk, and the release condition, outlive the spider).
})

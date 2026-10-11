import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Bearer has "Tap → Throw Spear of Destiny at any minion anywhere. It teleports
//  to that minion's location and kills it."'
registerScript('Spear of Destiny', {
  abilities: [{
    key: 'throw',
    label: 'Throw the Spear of Destiny (kill any minion)',
    cost: {},
    targets: [{ what: 'minion', count: 1, targeted: false, label: 'any minion anywhere' }],
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      const t = ctx.targets[0]
      if (!art || !bearer || bearer.tapped || !t || !('unit' in t)) return
      const victim = ctx.state.units[t.unit]
      if (!victim) return
      bearer.tapped = true
      bearer.carrying = bearer.carrying.filter((id) => id !== art.id)
      art.carriedBy = null
      art.x = victim.x
      art.y = victim.y
      art.region = victim.region
      pushLog(ctx.state, ctx.controller, `The Spear of Destiny finds ${victim.name}'s heart!`)
      ctx.kill(victim.id)
    },
  }],
})

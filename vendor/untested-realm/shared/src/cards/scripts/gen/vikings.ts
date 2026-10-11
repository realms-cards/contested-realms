import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'

// 'Tap → Deal 2 damage to each unit at target adjacent location.'
registerScript('Vikings', {
  abilities: [{
    key: 'raid',
    label: 'Raid an adjacent location (2 dmg to each unit)',
    cost: { tap: true },
    targets: [{ what: 'square', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent location' }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (!t || !('square' in t)) return
      for (const u of unitsAt(ctx.state, t.square.x, t.square.y)) ctx.dealDamage({ unit: u.id }, 2)
      pushLog(ctx.state, ctx.controller, 'The Vikings raid, axes swinging!')
    },
  }],
})

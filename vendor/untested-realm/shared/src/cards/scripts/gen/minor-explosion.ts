import { registerScript } from '../registry'
import { rangedLocationSpell } from '../multi-card-utils/ranged-location-spell'

// 'Deal 3 damage to each unit at target location up to two steps away.'
registerScript('Minor Explosion', rangedLocationSpell({
  steps: 2,
  perUnit: (ctx, u) => ctx.dealDamage({ unit: u.id }, 3),
}))

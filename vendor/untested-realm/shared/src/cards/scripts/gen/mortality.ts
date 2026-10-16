import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'
import { rangedLocationSpell } from '../multi-card-utils/ranged-location-spell'

// 'Kill all Mortal minions at target location up to two steps away.'
registerScript('Mortality', rangedLocationSpell({
  steps: 2,
  perUnit: (ctx, u) => {
    if (!u.isAvatar && hasSubtype(ctx.state, u, 'Mortal')) ctx.kill(u.id)
  },
}))

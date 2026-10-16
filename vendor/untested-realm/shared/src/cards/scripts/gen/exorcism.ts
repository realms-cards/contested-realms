import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'
import { rangedLocationSpell } from '../multi-card-utils/ranged-location-spell'

// 'Banish all Demon and Undead minions at target location up to two steps away.'
registerScript('Exorcism', rangedLocationSpell({
  steps: 2,
  perUnit: (ctx, u) => {
    if (u.isAvatar) return
    const st = effSubtypes(ctx.state, u)
    if (st.includes('Demon') || st.includes('Undead')) ctx.banish(u.id)
  },
}))

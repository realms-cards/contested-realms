import { registerScript } from '../registry'
import { awardAchievement } from '../../../engine/achievements.catalog'

// 'Deal 1 damage to target nearby minion and untap it.'
registerScript('Lash', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    ctx.dealDamage(t, 1)
    const u = ctx.state.units[t.unit]
    if (u) u.tapped = false
    // Kink of the realm — a whip effect (Lash) used on the King of the Realm
    if (u?.name === 'King of the Realm') awardAchievement(ctx.state, 'kink-of-realm', ctx.controller)
  },
})

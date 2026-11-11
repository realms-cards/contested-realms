import { registerScript } from '../registry'
import { trapScript } from '../multi-card-utils/trap'

// '(F)(F)(F) — Trap (7) → All minions on the surface take 20 damage.'
registerScript('Supervolcano', trapScript({
  label: 'all minions on the surface take 20 damage',
  mana: 7,
  threshold: { fire: 3 },
  effect: (ctx) => {
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && u.region === 'surface') ctx.dealDamage({ unit: u.id }, 20)
    }
    ctx.log('🌋 The Supervolcano erupts!')
  },
}))

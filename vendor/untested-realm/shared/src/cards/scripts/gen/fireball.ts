import { registerScript } from '../registry'
import { firstProjectileImpact } from '../../../engine/combat'
import { fireballHit } from './magic-helpers'

// 'Shoot a projectile. It deals 4 damage on impact, and 2 damage to each other unit at that location.'
registerScript('Fireball', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const c = ctx.caster!
    if (!dir || (dir !== 'n' && dir !== 's' && dir !== 'e' && dir !== 'w')) return ctx.log('Fizzled: no direction chosen.')
    // firstProjectileImpact stops at the first square holding a hittable unit and
    // also void-stops; 'notStealth' preserves the stealth filter.
    const impact = firstProjectileImpact(ctx.state, {
      player: ctx.controller, ox: c.x, oy: c.y, region: c.region, dir: String(dir), filter: 'notStealth', excludeId: c.id,
    })
    if (!impact) return ctx.log('The fireball flies off the realm.')
    if (impact.candidates.length === 1) return fireballHit(ctx, impact.candidates[0])
    // rules: the CASTER chooses which co-located unit takes the 4 damage
    ctx.ask(
      { kind: 'chooseTargets', title: 'Which unit does the fireball strike for 4?', data: { candidates: impact.candidates, count: 1, kind: 'unit' } },
      'fireballPick',
      {},
    )
  },
  conts: {
    fireballPick: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      if (typeof id === 'string') fireballHit(ctx, id)
    },
  },
})

import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Shoot three projectiles in the same direction, one at a time. Each deals 1 damage.'
registerScript('Magic Missiles', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const caster = ctx.caster!
    if (!dir) return ctx.log('No direction chosen.')
    // three projectiles, one at a time; the shooter picks the target when units
    // share a location. Infinite range (spell projectile).
    fireVolleyProjectiles(ctx.state, {
      player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
      dir: String(dir), volleys: 3, damage: 1, excludeId: caster.id, srcName: 'Magic Missiles',
    })
  },
})

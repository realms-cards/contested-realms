import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Shoot three projectiles, one at a time. Each deals 1 damage but melts before the third step.'
registerScript('Ice Shards', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const caster = ctx.caster!
    if (!dir) return ctx.log('No direction chosen.')
    // melts before the third step → range capped at 2
    fireVolleyProjectiles(ctx.state, {
      player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
      dir: String(dir), volleys: 3, damage: 1, maxRange: 2, excludeId: caster.id, srcName: 'Ice Shards',
    })
  },
})

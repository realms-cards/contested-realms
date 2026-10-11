import { registerScript } from '../registry'
import { fireVolleyProjectiles } from '../../../engine/combat'

// 'Shoot three projectiles in the same direction, one at a time. Each deals 1 damage.'
registerScript('Firebolts', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const caster = ctx.caster!
    if (!dir) return ctx.log('No direction chosen.')
    fireVolleyProjectiles(ctx.state, {
      player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
      dir: String(dir), volleys: 3, damage: 1, filter: 'notStealth', excludeId: caster.id, srcName: 'Firebolts',
    })
  },
})

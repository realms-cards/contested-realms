import { registerScript } from '../registry'
import { firePiercingProjectile } from '../../../engine/combat'

// 'UPDATED: Shoot a piercing projectile. Deal 2 damage to one unit at each
//  location along its path (the shooter chooses when several share a square).'
registerScript('Heat Ray', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const caster = ctx.caster!
    if (!dir) return ctx.log('No direction chosen.')
    firePiercingProjectile(ctx.state, {
      player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
      dir: String(dir), damage: 2, filter: 'notStealth', excludeId: caster.id, srcName: 'Heat Ray',
    })
  },
})

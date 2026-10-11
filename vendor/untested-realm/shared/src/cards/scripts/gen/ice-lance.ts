import { registerScript } from '../registry'
import { firePerSquareProjectile } from '../../../engine/combat'

// 'UPDATED: Shoot a piercing projectile. Deal 3, then 2, then 1 damage to up to
// one hit unit at each of the first three locations along its path.'
registerScript('Ice Lance', {
  shootsProjectile: true,
  onCast: (ctx) => {
    const dir = ctx.extra?.direction
    const caster = ctx.caster!
    if (!dir) return ctx.log('No direction chosen.')
    // piercing: up to one unit at each of the first three LOCATIONS (3/2/1) -- the FIRST is
    // the caster's own site (includeOrigin), then two more along the path; shooter-chosen
    // when several share a square.
    firePerSquareProjectile(ctx.state, {
      player: ctx.controller, ox: caster.x, oy: caster.y, region: caster.region,
      dir: String(dir), damages: [3, 2, 1], filter: 'notStealth', excludeId: caster.id, srcName: 'Ice Lance', includeOrigin: true,
    })
  },
})

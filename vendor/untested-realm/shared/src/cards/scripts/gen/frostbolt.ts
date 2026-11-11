import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { impactProjectileScript } from './magic-helpers'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Shoot a 3-damage projectile. On impact, all adjacent units are disabled until your next turn.'
// The units adjacent to where it hits: that location and the orthogonally bordering ones, in its region.
registerScript('Frostbolt', impactProjectileScript('Which unit does the frostbolt hit?', (ctx, id, at) => {
  const hit = ctx.state.units[id]
  if (!hit) return
  const { x, y } = at
  const region = hit.region
  ctx.dealDamage({ unit: hit.id }, 3)
  for (const sq of adjacentSquaresW(ctx.state, x, y)) {
    for (const u of unitsAt(ctx.state, sq.x, sq.y, region)) disableUntilYourNextTurn(ctx.state, u.id, ctx.controller)
  }
  ctx.log('Ice spreads from the impact.')
}))

import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { impactProjectileScript } from './magic-helpers'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'
import { runDamageEvent } from '../../../engine/effects'

// 'Shoot a 3-damage projectile. On impact, all adjacent units are disabled until your next turn.'
// The units adjacent to where it hits: that location and the orthogonally bordering ones, in its region.
// FAQ (Frostbolt, Hailstriker, When the Peaks Fell): the damage and the disable are simultaneous — damage
// statics (Shield Maidens, Royal Bodyguard) still apply, but a unit it kills fires no Deathrite. So the
// damage is dealt inside one damage event (its death waits) and the disable lands before that event closes.
registerScript('Frostbolt', impactProjectileScript('Which unit does the frostbolt hit?', (ctx, id, at) => {
  const hit = ctx.state.units[id]
  if (!hit) return
  const { x, y } = at
  const region = hit.region
  runDamageEvent(ctx.state, () => {
    ctx.dealDamage({ unit: hit.id }, 3)
    for (const sq of adjacentSquaresW(ctx.state, x, y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y, region)) disableUntilYourNextTurn(ctx, u.id, ctx.controller)
    }
  })
  ctx.log('Ice spreads from the impact.')
}))

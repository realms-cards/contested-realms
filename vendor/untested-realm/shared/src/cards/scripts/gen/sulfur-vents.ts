import { registerScript } from '../registry'
import { adjacentSquaresW, unitsAt } from '../../../engine/grid'
import { trapScript } from '../multi-card-utils/trap'

// 'Trap (1) → Deal 1 damage to each adjacent minion.'
// Adjacent to the site: its own square and the bordering ones, above and below ground — but not a void
// (a site's locations are its surface and subsurface; the void is another region).
registerScript('Sulfur Vents', trapScript({
  label: '1 damage to each adjacent minion',
  mana: 1,
  effect: (ctx, site) => {
    for (const sq of adjacentSquaresW(ctx.state, site.x, site.y)) {
      for (const u of unitsAt(ctx.state, sq.x, sq.y)) if (!u.isAvatar && u.region !== 'void') ctx.dealDamage({ unit: u.id }, 1)
    }
  },
}))

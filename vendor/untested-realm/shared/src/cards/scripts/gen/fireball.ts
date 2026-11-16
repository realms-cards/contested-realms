import { registerScript } from '../registry'
import { impactProjectileScript } from './magic-helpers'
import { applyGrid, type Cell } from '../multi-card-utils/apply-grid'

// 'Shoot a projectile. It explodes on impact, dealing damage to each unit at affected locations: 4 at the
// location it hits, and 2 at each location orthogonally adjacent to it (plus-shaped pattern).'
// (The Frost Mage vs Lavamancer text, which replaced the Alpha/Beta "4 on impact, 2 to each other unit there".)
const PLUS: Cell[] = [
  { dx: 0, dy: 0, dmg: 4 },
  { dx: 1, dy: 0, dmg: 2 }, { dx: -1, dy: 0, dmg: 2 }, { dx: 0, dy: 1, dmg: 2 }, { dx: 0, dy: -1, dmg: 2 },
]

// the explosion covers the whole hit LOCATION, so which unit there was hit doesn't matter
registerScript('Fireball', impactProjectileScript('Where does the fireball hit?', (ctx, id, at) => {
  const hit = ctx.state.units[id]
  if (hit) applyGrid(ctx, at, PLUS, 'n', { region: hit.region })
}, false))

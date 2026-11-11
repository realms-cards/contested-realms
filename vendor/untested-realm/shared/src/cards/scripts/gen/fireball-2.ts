import { registerScript } from '../registry'
import { impactProjectileScript } from './magic-helpers'
import { applyGrid, type Cell } from '../multi-card-utils/apply-grid'

// 'Shoot a projectile. It explodes on impact, dealing damage to each unit at affected locations: 4 at the
// location it hits, and 2 at each location orthogonally adjacent to it (plus-shaped pattern).'
// (The Frost Mage vs Lavamancer Fireball; the Alpha/Beta Fireball keeps its own text until that set is out.)
const PLUS: Cell[] = [
  { dx: 0, dy: 0, dmg: 4 },
  { dx: 1, dy: 0, dmg: 2 }, { dx: -1, dy: 0, dmg: 2 }, { dx: 0, dy: 1, dmg: 2 }, { dx: 0, dy: -1, dmg: 2 },
]

// the explosion covers the whole hit LOCATION, so which unit there was hit doesn't matter
registerScript('Fireball 2', impactProjectileScript('Where does the fireball hit?', (ctx, id, at) => {
  const hit = ctx.state.units[id]
  if (hit) applyGrid(ctx, at, PLUS, 'n', { region: hit.region })
}, false))

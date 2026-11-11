import { registerScript } from '../registry'
import { trapScript } from '../multi-card-utils/trap'
import { surfaceSweepPath, carryAlongPath } from '../multi-card-utils/surface-sweep'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Trap (2) → Snow flows forward, carrying and disabling surface units until your next turn.'
// The snow starts at this site and flows forward — toward the opponent of whoever springs it — along
// the surface until the edge or the void (wrapping under Magellan Globe, like a Rolling Boulder), like a
// Snowball's roll: every surface unit on its way is swept
// toward where it stops (one that can't enter a site on the way is dropped before it), and every unit it
// swept up is disabled until that player's next turn.
registerScript('Avalanche', trapScript({
  label: 'snow flows forward, carrying and disabling surface units',
  mana: 2,
  effect: (ctx, site) => {
    const forward = ctx.controller === 0 ? 1 : -1
    const path = surfaceSweepPath(ctx.state, { x: site.x, y: site.y }, { dx: 0, dy: forward }, false)
    const swept = carryAlongPath(ctx, path)
    for (const u of swept) disableUntilYourNextTurn(ctx.state, u.id, ctx.controller)
    ctx.log(`❄ An avalanche sweeps ${swept.length} unit${swept.length === 1 ? '' : 's'} away!`)
  },
}))

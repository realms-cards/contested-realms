import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import type { GameState, UnitState } from '../../../engine/types'
import { Cell, Dir, applyGrid, resolveCells } from '../multi-card-utils/apply-grid'

// "Lava flows from the caster's site in a cardinal direction. [5 / 4 / 2 column,
// each OTHER unit occupying a site]"
const LAVA_FLOW_CELLS: Cell[] = [
  { dx: 0, dy: 0, dmg: 5 }, { dx: 0, dy: 1, dmg: 4 }, { dx: 0, dy: 2, dmg: 2 },
]

/** "Lava flows from the caster's SITE" — the origin is the site the caster stands on. */
function lavaFlowOrigin(state: GameState, caster: UnitState): { x: number; y: number } {
  const site = siteAt(state, caster.x, caster.y)
  return site ? { x: site.x, y: site.y } : { x: caster.x, y: caster.y }
}

registerScript('Lava Flow', {
  areaDamage: (state, casterId, params) => {
    const caster = state.units[casterId]
    if (!caster || !params.direction) return null
    return resolveCells(state, lavaFlowOrigin(state, caster), LAVA_FLOW_CELLS, params.direction, { atopSitesOnly: true })
  },
  onCast: (ctx) => {
    ctx.ask({ kind: 'chooseOption', title: 'The lava flows in which direction?', data: { options: ['n', 's', 'e', 'w'] } }, 'flow')
  },
  conts: {
    flow: (ctx, _c, dir) => {
      if (!dir) return
      const caster = ctx.caster!
      // "Lava flows from the caster's SITE" — the origin is the site the caster stands on, and
      // the caster's site is the FIRST (highest, 5) cell of the flow, NOT an untouched source
      // (card diagram 2/4/5, with 5 nearest): caster's site 5 → next 4 → farthest 2 in the
      // direction. `skipUnitId` still spares the caster itself, but OTHER units on its site take 5.
      const origin = lavaFlowOrigin(ctx.state, caster)
      // "each other unit occupying a SITE in the area" → sites only, but ALL regions, so units
      // burrowed underground or submerged underwater on those sites are hit too (not just surface).
      applyGrid(ctx, origin, LAVA_FLOW_CELLS, dir as Dir, { skipUnitId: caster.id, atopSitesOnly: true, region: 'allRegions' })
    },
  },
})

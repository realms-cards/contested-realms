import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import type { GameState, SiteState } from '../../../engine/types'
import { trapScript } from '../multi-card-utils/trap'

// 'Trap (1) → Deal 3 damage to a unit here.'
// "A unit here" isn't targeting: any unit at this site, above or below, its springer's choice.
const here = (state: GameState, site: SiteState) => unitsAt(state, site.x, site.y).filter((u) => u.region !== 'void')

registerScript('Spike Trap', trapScript({
  label: '3 damage to a unit here',
  mana: 1,
  effect: (ctx, site) => {
    const units = here(ctx.state, site)
    if (units.length === 1) return ctx.dealDamage({ unit: units[0].id }, 3)
    if (units.length > 1) {
      ctx.ask({ kind: 'chooseTargets', title: 'Spike Trap: which unit is impaled?', data: { candidates: units.map((u) => u.id), count: 1, kind: 'unit', notTargeted: true } }, 'spike')
    }
  },
  conts: {
    spike: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[ctx.sourceId]
      if (typeof id === 'string' && site && here(ctx.state, site).some((u) => u.id === id)) ctx.dealDamage({ unit: id }, 3)
    },
  },
}))

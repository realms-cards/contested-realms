import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, adjacentSquaresW, siteAt, unitsAt } from '../../../engine/grid'
import type { GameState, UnitState } from '../../../engine/types'

/** minions above or below a water site adjacent to the Harpooneers that they may target */
function harpoonPrey(state: GameState, self: UnitState): string[] {
  return adjacentSquaresW(state, self.x, self.y)
    .filter((s) => {
      const site = siteAt(state, s.x, s.y)
      return !!site && isWaterSite(state, site, getCard)
    })
    .flatMap((s) => [...unitsAt(state, s.x, s.y, 'surface'), ...unitsAt(state, s.x, s.y, 'underwater')])
    // "target minion": an enemy's Stealth hides it from targeting (as a targeted TargetSpec does)
    .filter((u) => !u.isAvatar && !(u.stealth && u.controller !== self.controller))
    .map((u) => u.id)
}

// 'Tap → Deal 1 damage to target minion above or below an adjacent water site
//  and pull that minion to this location.'
registerScript('Ormund Harpooneers', {
  abilities: [{
    key: 'harpoon',
    label: 'Harpoon a minion at adjacent water',
    cost: { tap: true },
    // "target minion": with no legal target the ability can't be used at all (codex Target), so it isn't
    // offered and nothing is tapped
    available: (state, id) => { const self = state.units[id]; return !!self && harpoonPrey(state, self).length > 0 },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const prey = harpoonPrey(ctx.state, self)
      if (!prey.length) return ctx.log('Nothing to harpoon.')
      ctx.ask({ kind: 'chooseTargets', title: 'Harpoon which minion?', data: { candidates: prey, count: 1, upTo: false, kind: 'unit' } }, 'reel')
    },
  }],
  conts: {
    reel: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const prey = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !prey) return
      ctx.dealDamage({ unit: prey.id }, 1)
      ctx.settleDeaths() // single target: resolve its death now so a killed minion isn't pulled as a corpse
      if (ctx.state.units[prey.id]) ctx.teleport(prey.id, self.x, self.y, self.region, { push: true }) // forced pull
    },
  },
})

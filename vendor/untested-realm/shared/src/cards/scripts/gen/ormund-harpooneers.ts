import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, orthAdjacentWrapped, siteAt, unitsAt } from '../../../engine/grid'

// 'Tap → Deal 1 damage to target minion above or below an adjacent water site
//  and pull that minion to this location.'
registerScript('Ormund Harpooneers', {
  abilities: [{
    key: 'harpoon',
    label: 'Harpoon a minion at adjacent water',
    cost: { tap: true },
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const prey = orthAdjacentWrapped(ctx.state, self.x, self.y)
        .filter((s) => {
          const site = siteAt(ctx.state, s.x, s.y)
          return !!site && isWaterSite(ctx.state, site, getCard)
        })
        .flatMap((s) => [...unitsAt(ctx.state, s.x, s.y, 'surface'), ...unitsAt(ctx.state, s.x, s.y, 'underwater')])
        .filter((u) => !u.isAvatar)
        .map((u) => u.id)
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

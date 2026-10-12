import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Once on your turn, if you occupy an Air site, you may fly a unit atop it to a nearby site.'
registerScript('Avatar of Air', {
  abilities: [{
    key: 'fly',
    label: 'Fly a unit here to a nearby site',
    cost: {},
    oncePerTurn: true,
    // "if you occupy an Air site" -- hide the ability entirely off an air site
    available: (state, sourceId) => {
      const self = state.units[sourceId]
      if (!self) return false
      const site = siteAt(state, self.x, self.y)
      return !!site && getCard(site.name).thresholds.air > 0
    },
    targets: [{ what: 'unit', count: 1, targeted: false, where: 'here', label: 'a unit atop your site' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t)) return
      const site = siteAt(ctx.state, self.x, self.y)
      if (!site || getCard(site.name).thresholds.air <= 0) return ctx.log('You must occupy an Air site.')
      const u = ctx.state.units[t.unit]
      if (!u || u.x !== self.x || u.y !== self.y) return
      const options = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y) && !(s.x === self.x && s.y === self.y))
      if (!options.length) return
      ctx.ask(
        { kind: 'chooseTargets', title: 'Fly to which nearby site?', data: { candidates: options.map((s) => siteAt(ctx.state, s.x, s.y)!.id), count: 1, kind: 'site' } },
        'flyDest',
        { unitId: u.id },
      )
    },
  }],
  conts: {
    flyDest: (ctx, contCtx, choice) => {
      const siteId = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[siteId]
      const u = ctx.state.units[contCtx.unitId]
      if (site && u) ctx.teleport(u.id, site.x, site.y, 'surface')
    },
  },
})

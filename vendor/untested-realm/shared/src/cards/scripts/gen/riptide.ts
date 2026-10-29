import { registerScript } from '../registry'
import { getCard } from '../../db'
import { waterSiteTargets } from '../multi-card-utils/site-terrain-targets'
import { isWaterSite, orthAdjacentWrapped, unitsAt } from '../../../engine/grid'

// 'Target water site pulls in an aboveground unit it's adjacent to. Draw a card.'
registerScript('Riptide', {
  targets: [{
    what: 'site', count: 1, targeted: true, label: 'target water site',
    filter: (state, s) => isWaterSite(state, s, getCard),
  }],
  targetOptions: (state) => waterSiteTargets(state), // engine-authoritative glow: every water site
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('site' in t)) return
    const site = ctx.state.sites[t.site]
    if (!site) return ctx.drawCard(ctx.controller)
    // "pulls IN" a unit from a neighbouring square: one already on the site isn't pulled in. Only the site
    // is targeted — the unit isn't, so a Ward doesn't break over the pull (Codex, Ward)
    const pullable = orthAdjacentWrapped(ctx.state, site.x, site.y).flatMap((s) => unitsAt(ctx.state, s.x, s.y, 'surface')).map((u) => u.id)
    if (!pullable.length) return ctx.drawCard(ctx.controller)
    ctx.ask({ kind: 'chooseTargets', title: 'The riptide drags in which unit?', data: { candidates: pullable, count: 1, upTo: false, kind: 'unit', notTargeted: true } }, 'pull', { siteId: site.id })
  },
  conts: {
    pull: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[c.siteId as string]
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (site && u) ctx.teleport(u.id, site.x, site.y, 'surface', { push: true }) // a pull, not a Teleport (Cage of Sidrak)
      ctx.drawCard(ctx.controller)
    },
  },
})

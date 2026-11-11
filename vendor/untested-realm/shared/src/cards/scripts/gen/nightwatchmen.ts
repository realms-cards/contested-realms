import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'
import { wardSite } from '../../../engine/effects'

// 'Genesis → Ward this site.'
registerScript('Nightwatchmen', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const site = siteAt(ctx.state, self.x, self.y)
    if (site) wardSite(ctx.state, site, ctx.controller) // site ward — no Evil clause
  },
})

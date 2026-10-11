import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Genesis → Ward this site.'
registerScript('Nightwatchmen', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const site = siteAt(ctx.state, self.x, self.y)
    if (site) site.ward = true // site ward — no Evil clause, kept direct
  },
})

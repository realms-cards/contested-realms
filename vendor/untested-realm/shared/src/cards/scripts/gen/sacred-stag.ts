import { registerScript } from '../registry'
import { pushLog, wardSite } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Ward / Deathrite → You may Ward this site.'
registerScript('Sacred Stag', {
  deathrite: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const site = self ? siteAt(ctx.state, self.x, self.y) : null
    if (!site) return
    ctx.ask({ kind: 'yesNo', title: `Ward ${site.name} with the Stag's spirit?` }, 'bless', { siteId: site.id })
  },
  conts: {
    bless: (ctx, c, yes) => {
      const site = ctx.state.sites[c.siteId as string]
      if (yes && site) {
        wardSite(ctx.state, site, ctx.controller) // site ward — no Evil clause
        pushLog(ctx.state, ctx.controller, `${site.name} is warded by the Sacred Stag's spirit.`)
      }
    },
  },
})

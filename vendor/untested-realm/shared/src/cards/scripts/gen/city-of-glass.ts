import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// '(A) — Provides (2) instead but is destroyed when damaged.'
registerScript('City of Glass', {
  siteExtraMana: 1,
  onSiteDamaged: (ctx, site, _n, by) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || site.id !== self.id) return
    pushLog(ctx.state, ctx.controller, 'The City of Glass shatters into a million shards!')
    // credit the shatter to whoever dealt the damage, so a nearby allied Vindictive
    // Nation punishes THEM for it (not the City's own owner).
    ctx.destroySite(self.id, by ?? undefined)
  },
})

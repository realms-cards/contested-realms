import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { cityActive } from '../multi-card-utils/city-threshold'

// '(A) — Provides (2) instead but is destroyed when damaged.'
registerScript('City of Glass', {
  siteExtraManaFn: (state, siteId) => (cityActive(state, siteId, 'air') ? 1 : 0),
  onSiteDamaged: (ctx, site, _n, by) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || site.id !== self.id || !cityActive(ctx.state, self.id, 'air')) return
    pushLog(ctx.state, ctx.controller, 'The City of Glass shatters into a million shards!')
    // credit the shatter to whoever dealt the damage, so a nearby allied Vindictive
    // Nation punishes THEM for it (not the City's own owner).
    ctx.destroySite(self.id, by ?? undefined)
  },
})

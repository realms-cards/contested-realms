import { registerScript } from '../registry'
import { cityActive } from '../multi-card-utils/city-threshold'

// '(E) — Provides (2) instead but enemies can redirect damage dealt to this
//  site to any unit.'
registerScript('City of Souls', {
  siteExtraManaFn: (state, siteId) => (cityActive(state, siteId, 'earth') ? 1 : 0),
  siteDamageRedirect: (state, site) => cityActive(state, site.id, 'earth'),
})

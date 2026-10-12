import { registerScript } from '../registry'

// '(E) — Provides (2) instead but enemies can redirect damage dealt to this
//  site to any unit.'
registerScript('City of Souls', {
  siteExtraMana: 1,
  siteDamageRedirect: true,
})

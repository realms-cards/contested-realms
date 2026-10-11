import { registerScript } from '../registry'
import { getKeywords } from '../../db'

// 'Ranged units atop this site have +1 range.'
registerScript('Vantage Hills', {
  siteGrantsKeywords: (state, site, unit) => {
    if (unit.x !== site.x || unit.y !== site.y || unit.region !== 'surface') return []
    const printed = getKeywords(unit.name).ranged
    return printed ? [`ranged ${printed + 1}`] : []
  },
})

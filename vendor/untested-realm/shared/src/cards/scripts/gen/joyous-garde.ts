import { registerScript } from '../registry'
import { GRID_H } from '../../../engine/grid'

// back-row-only sites
registerScript('Joyous Garde', {
  siteProvides: (state, site) => {
    if (site.controller === null) return false
    const backRow = site.controller === 0 ? 0 : GRID_H - 1
    return site.y === backRow
  },
})

import { registerScript } from '../registry'
import { GRID_H } from '../../../engine/grid'

// 'Only provides mana and threshold while in your back row.'
registerScript('Tintagel', {
  siteProvides: (state, site) => {
    if (site.controller === null) return false
    const backY = site.controller === 0 ? 0 : GRID_H - 1
    return site.y === backY
  },
})

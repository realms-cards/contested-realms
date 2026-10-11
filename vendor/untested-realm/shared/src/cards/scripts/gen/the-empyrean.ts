import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'

// 'Provides (A)(E)(F)(W) if you control a nearby Angel or Ward.' — text means the
// site only provides while the condition holds.
registerScript('The Empyrean', {
  siteProvides: (state, site) => {
    if (site.controller === null) return false
    for (const sq of nearbySquaresW(state, site.x, site.y)) {
      for (const u of unitsAt(state, sq.x, sq.y)) {
        if (u.controller !== site.controller) continue
        if (u.ward || effSubtypes(state, u).includes('Angel')) return true
      }
    }
    return false
  },
})

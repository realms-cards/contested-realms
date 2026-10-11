import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'

// "Minions can't enter this site on the ground if there's already a minion there."
registerScript('Mountain Pass', {
  entryFilter: (state, selfId, unit, from, to) => {
    const site = state.sites[selfId]
    if (!site || unit.isAvatar) return true
    if (to.x !== site.x || to.y !== site.y || to.region !== 'surface') return true
    if (from.region !== 'surface') return true // not "on the ground"
    if (effKeywords(state, unit).airborne) return true // airborne isn't "on the ground"
    const occupied = unitsAt(state, site.x, site.y, 'surface').some((u) => !u.isAvatar && u.id !== unit.id)
    return !occupied
  },
})

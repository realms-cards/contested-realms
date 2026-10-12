import { registerScript } from '../registry'
import { effKeywords } from '../../../engine/statics'

// 'Airborne minions atop Updraft Ridge move freely away.'
registerScript('Updraft Ridge', {
  siteFreeStep: (state, site, unit, from) => {
    if (unit.isAvatar || from.region !== 'surface') return false
    if (from.x !== site.x || from.y !== site.y) return false
    return !!effKeywords(state, unit).airborne
  },
})

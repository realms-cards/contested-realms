import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'

// "Beasts here can't be targeted by enemies."
registerScript('Varmint Warrens', {
  protectsFromTargeting: (state, site, unit) => {
    if (unit.x !== site.x || unit.y !== site.y || unit.isAvatar) return false
    return effSubtypes(state, unit).includes('Beast')
  },
})

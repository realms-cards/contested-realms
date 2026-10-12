import { registerScript } from '../registry'
import { effSubtypes } from '../../../engine/statics'

// 'Faeries here are disabled.' (artifact on the ground)
registerScript('Cold Iron Rod', {
  disablesOther: (state, selfId, unit) => {
    const art = state.artifacts[selfId]
    if (!art || unit.isAvatar) return false
    if (unit.x !== art.x || unit.y !== art.y || unit.region !== art.region) return false
    return effSubtypes(state, unit).includes('Faerie')
  },
})

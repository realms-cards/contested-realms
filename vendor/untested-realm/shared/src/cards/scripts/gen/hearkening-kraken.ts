import { registerScript } from '../registry'
import { bodyOfWaterAt } from './util'

// 'Submerge / Must be cast submerged, and costs (1) less for each enemy in its body of water.'
registerScript('Hearkening Kraken', {
  mustSummonRegion: 'underwater',
  selfCostModifier: (state, player, at) => {
    if (!at) return 0
    let discount = 0
    const body = bodyOfWaterAt(state, at.x, at.y)
    for (const u of Object.values(state.units)) {
      if (u.controller !== player && body.has(`${u.x},${u.y}`)) discount -= 1
    }
    return discount
  },
})

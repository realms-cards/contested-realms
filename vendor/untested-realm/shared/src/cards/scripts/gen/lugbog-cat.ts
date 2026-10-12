import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, siteAt } from '../../../engine/grid'

// 'Can and must be cast to any water site.'
registerScript('Lugbog Cat', {
  summonAnywhere: true,
  summonFilter: (state, player, at) => {
    const site = siteAt(state, at.x, at.y)
    return site && isWaterSite(state, site, getCard) ? null : 'Lugbog Cat must be cast to a water site.'
  },
})

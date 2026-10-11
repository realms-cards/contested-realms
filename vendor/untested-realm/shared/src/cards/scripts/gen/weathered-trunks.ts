import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'

// 'Must be cast to an allied site occupied by an enemy.'
registerScript('Weathered Trunks', {
  summonFilter: (state, player, at) => {
    const site = siteAt(state, at.x, at.y)
    if (!site || site.controller !== player) return 'Must be cast to your own site.'
    return unitsAt(state, at.x, at.y).some((u) => u.controller !== player)
      ? null
      : 'The Trunks only wake where enemies trespass.'
  },
})

import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Evil minions nearby or being summoned nearby have Burrowing.'
registerScript('Hellmouth', {
  siteGrantsKeywords: (state, site, unit) => {
    if (unit.isAvatar || !isEvilU(state, unit)) return []
    return nearbySquaresW(state, site.x, site.y).some((s) => s.x === unit.x && s.y === unit.y) ? ['burrowing'] : []
  },
})

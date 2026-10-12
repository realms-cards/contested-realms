import { registerScript } from '../registry'
import { getCard } from '../../db'
import { isWaterSite, siteAt } from '../../../engine/grid'

// 'Submerge / Moves freely between water locations.'
registerScript('Sir Pelleas', {
  freeStep: (state, _unit, from, to) => {
    const isWater = (x: number, y: number) => {
      const s = siteAt(state, x, y)
      return !!s && isWaterSite(state, s, getCard)
    }
    return isWater(from.x, from.y) && isWater(to.x, to.y)
  },
})

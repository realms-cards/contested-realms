import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'Nearby allies have +1 power while there are no enemies here.'
registerScript('Pendragon Banner', {
  artifactGrantsPower: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    if (!art) return 0 // an allied AVATAR is an ally too — it gets the +1 (positive buffs apply to avatars)
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    if (controller === undefined || unit.controller !== controller) return 0
    // "no enemies here" = the Banner's OWN location/region (carried → its bearer's; it can also be buried/submerged)
    const enemiesHere = unitsAt(state, art.x, art.y, art.region).some((u) => u.controller !== controller)
    if (enemiesHere) return 0
    return nearbySquaresW(state, art.x, art.y).some((s) => s.x === unit.x && s.y === unit.y) ? 1 : 0
  },
})

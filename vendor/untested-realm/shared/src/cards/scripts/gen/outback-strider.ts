import { registerScript } from '../registry'
import { unitsAt } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'

// 'Moves freely between unoccupied land sites.'
registerScript('Outback Strider', {
  freeStep: (state, unit, from, to) => {
    if (from.region !== 'surface' || to.region !== 'surface') return false
    if (terrainAt(state, from.x, from.y) !== 'land' || terrainAt(state, to.x, to.y) !== 'land') return false
    const emptyFrom = unitsAt(state, from.x, from.y, 'surface').every((u) => u.id === unit.id)
    const emptyTo = unitsAt(state, to.x, to.y, 'surface').length === 0
    return emptyFrom && emptyTo
  },
})

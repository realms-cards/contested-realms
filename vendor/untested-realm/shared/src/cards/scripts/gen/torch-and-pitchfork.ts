import { registerScript } from '../registry'
import { getCard } from '../../db'
import { nearbySquaresW } from '../../../engine/grid'

// 'Ordinary bearer has "Nearby Ordinary allies have +1 power."'
registerScript('Torch and Pitchfork', {
  artifactGrantsPower: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    const bearer = art?.carriedBy ? state.units[art.carriedBy] : null
    if (!bearer || getCard(bearer.name).rarity !== 'Ordinary') return 0
    if (unit.isAvatar || unit.controller !== bearer.controller || getCard(unit.name).rarity !== 'Ordinary') return 0
    return nearbySquaresW(state, bearer.x, bearer.y).some((s) => s.x === unit.x && s.y === unit.y) ? 1 : 0
  },
})

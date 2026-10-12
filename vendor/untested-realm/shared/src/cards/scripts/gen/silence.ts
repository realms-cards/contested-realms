import { registerScript } from '../registry'
import { siteAt } from '../../../engine/grid'

// 'Minions occupying affected sites are silenced.'
registerScript('Silence', {
  silencesUnit: (state, selfId, unit) => {
    const aura = state.auras[selfId]
    if (!aura || unit.isAvatar || unit.region !== 'surface') return false
    return aura.squares.some((s) => s.x === unit.x && s.y === unit.y && siteAt(state, s.x, s.y))
  },
})

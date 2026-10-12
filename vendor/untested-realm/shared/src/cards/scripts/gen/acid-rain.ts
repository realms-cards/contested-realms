import { registerScript } from '../registry'
import { isArtifactUnit } from '../../../engine/statics'

// 'Silence affected sites and artifacts there.'
registerScript('Acid Rain', {
  auraSilencesSites: true,
  auraSilencesArtifacts: true,
  // automatons are artifacts — the rain eats them too
  silencesUnit: (state, selfId, unit) => {
    const aura = state.auras[selfId]
    if (!aura || !isArtifactUnit(state, unit)) return false
    return aura.squares.some((q) => q.x === unit.x && q.y === unit.y)
  },
})

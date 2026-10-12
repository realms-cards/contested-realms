import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { effKeywords } from '../../../engine/statics'

// (Keening Banshee already scripted in m8.)

// 'Spells cast by a nearby Spellcaster cost ② more to cast.'
registerScript('Maddening Bells', {
  costModifier: (state, sourceId, caster) => {
    const art = state.artifacts[sourceId]
    if (!art) return 0
    const kw = effKeywords(state, caster)
    if (!kw.spellcaster && !caster.isAvatar) return 0
    return nearbySquaresW(state, art.x, art.y).some((s) => s.x === caster.x && s.y === caster.y) ? 2 : 0
  },
})

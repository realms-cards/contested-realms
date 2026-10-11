import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Damage dealt to minions nearby is lethal.'
registerScript('Drums of Doom', {
  damageModifierKind: 'lethal',
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    if (!art || victim.isAvatar) return amount
    // "nearby" is region-locked to the source (like every other nearby-minion effect): a surface
    // Drums doesn't reach a minion burrowed underground / submerged underwater beneath a nearby site.
    if (victim.region !== (art.region ?? 'surface')) return amount
    if (nearbySquaresW(state, art.x, art.y).some((s) => s.x === victim.x && s.y === victim.y)) {
      return { amount, lethal: true }
    }
    return amount
  },
})

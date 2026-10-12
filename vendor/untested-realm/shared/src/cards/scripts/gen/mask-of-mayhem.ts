import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Whenever a nearby minion can attack, it must. / Nearby strikes against units
//  deal double damage.' (the must-attack half is enforced by the endTurn guard)
registerScript('Mask of Mayhem', {
  damageModifierKind: 'mul',
  forcesNearbyAttacks: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (source?.kind !== 'strike' || !source.attackerId) return amount
    const art = state.artifacts[selfId]
    if (!art) return amount
    const striker = state.units[source.attackerId]
    if (!striker) return amount
    return nearbySquaresW(state, art.x, art.y).some((s) => s.x === striker.x && s.y === striker.y) &&
      nearbySquaresW(state, art.x, art.y).some((s) => s.x === victim.x && s.y === victim.y)
      ? amount * 2
      : amount
  },
})

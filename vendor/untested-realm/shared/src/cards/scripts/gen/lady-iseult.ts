import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { pushLog, removeUnitFromRealm } from '../../../engine/effects'

// 'If another nearby allied minion would die, return it to hand.'
registerScript('Lady Iseult', {
  onWouldDie: (state, selfId, dying) => {
    const self = state.units[selfId]
    if (!self || dying.id === selfId || dying.isAvatar) return false
    if (dying.controller !== self.controller) return false
    if (!nearbySquaresW(state, self.x, self.y).some((s) => s.x === dying.x && s.y === dying.y)) return false
    // return it to hand instead
    const card = state.cards[dying.cardId]
    if (removeUnitFromRealm(state, dying.id)) delete state.units[dying.id] // cargo stays (FAQ); avatars refuse removal
    if (card && !card.isToken) state.players[card.owner].hand.push(card.id)
    pushLog(state, self.controller, `Lady Iseult spirits ${dying.name} away to safety.`)
    return true
  },
})

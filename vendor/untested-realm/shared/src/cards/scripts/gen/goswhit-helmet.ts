import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'If bearer would take strike damage, prevent it and return this helmet to hand.'
registerScript('Goswhit Helmet', {
  damagePreventer: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (source.kind !== 'strike') return amount
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== victim.id) return amount
    // prevent and bounce the helmet
    victim.carrying = victim.carrying.filter((id) => id !== selfId)
    const card = state.cards[art.cardId]
    if (card && !card.isToken) state.players[card.owner].hand.push(card.id)
    delete state.artifacts[selfId]
    pushLog(state, victim.controller, `The Goswhit Helmet rings — the blow is turned aside!`)
    return 0
  },
})

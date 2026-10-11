import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'If bearer is a minion and would die, instead fully heal it and banish Gilded Aegis.'
registerScript('Gilded Aegis', {
  onWouldDie: (state, selfId, dying) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== dying.id || dying.isAvatar) return false
    dying.damage = 0
    // banish the aegis
    dying.carrying = dying.carrying.filter((id) => id !== selfId)
    const card = state.cards[art.cardId]
    if (card && !card.isToken) state.players[card.owner].banished.push(card.id)
    delete state.artifacts[selfId]
    pushLog(state, dying.controller, `The Gilded Aegis flares and shatters — ${dying.name} is fully healed!`)
    return true
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'You may summon Spirits to affected sites. When you summon a Spirit here, give
//  it Charge, and return Evil Presence to its owner's hand.'
registerScript('Evil Presence', {
  auraAllowsSummon: (state, aura, player, cardName, at) =>
    aura.controller === player &&
    getCard(cardName).subtypes.includes('Spirit') &&
    aura.squares.some((s) => s.x === at.x && s.y === at.y),
  onUnitEnters: (ctx, entered) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura || entered.controller !== ctx.controller || entered.isAvatar) return
    if (entered.enteredTurn !== ctx.state.turn) return
    if (!effSubtypes(ctx.state, entered).includes('Spirit')) return
    if (!aura.squares.some((s) => s.x === entered.x && s.y === entered.y)) return
    ctx.grantKeyword(entered.id, 'charge', 'permanent')
    const card = ctx.state.cards[aura.cardId]
    if (card && !card.isToken) ctx.state.players[card.owner].hand.push(card.id)
    delete ctx.state.auras[aura.id]
    pushLog(ctx.state, ctx.controller, 'The Evil Presence fades, its bargain struck.')
  },
})

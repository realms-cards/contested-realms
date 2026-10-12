import { registerScript } from '../registry'
import { pushLog, checkStateBased, killUnit } from '../../../engine/effects'

// 'When a minion enters here, kill it, then return this site to hand, leaving Rubble behind.'
registerScript("Old Mortimer's Den", {
  onUnitEntersSquare: (ctx, moved) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || moved.isAvatar) return
    if (moved.x !== self.x || moved.y !== self.y) return
    pushLog(ctx.state, ctx.controller, `Old Mortimer deals with ${moved.name}...`)
    killUnit(ctx.state, moved.id)
    // return the site to hand, leaving rubble
    const card = ctx.state.cards[self.cardId]
    const { x, y } = self
    delete ctx.state.sites[self.id]
    if (card && !card.isToken) ctx.state.players[card.owner].hand.push(card.id)
    const rubbleCardId = `c${ctx.state.nextId++}`
    ctx.state.cards[rubbleCardId] = { id: rubbleCardId, name: 'Rubble', owner: card?.owner ?? ctx.controller, isToken: true }
    const rubbleId = `s${ctx.state.nextId++}`
    ctx.state.sites[rubbleId] = {
      id: rubbleId, cardId: rubbleCardId, name: 'Rubble', owner: card?.owner ?? ctx.controller,
      controller: null, x, y, tapped: false, isRubble: true,
    }
    checkStateBased(ctx.state)
  },
})

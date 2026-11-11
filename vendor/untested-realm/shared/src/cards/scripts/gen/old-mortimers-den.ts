import { registerScript } from '../registry'
import { pushLog, checkStateBased, killUnit, placeRubble } from '../../../engine/effects'

// 'When a minion enters here, kill it, then return this site to hand, leaving Rubble behind.'
registerScript("Old Mortimer's Den", {
  onUnitEntersSquare: (ctx, moved, from) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self || moved.isAvatar) return
    if (moved.x !== self.x || moved.y !== self.y) return
    // codex Enter: moving between the site's levels (surfacing from underneath it) isn't entering it
    if (from.x === self.x && from.y === self.y) return
    pushLog(ctx.state, ctx.controller, `Old Mortimer deals with ${moved.name}...`)
    killUnit(ctx.state, moved.id)
    // return the site to hand, leaving rubble
    const card = ctx.state.cards[self.cardId]
    const { x, y } = self
    delete ctx.state.sites[self.id]
    if (card && !card.isToken) ctx.state.players[card.owner].hand.push(card.id)
    placeRubble(ctx.state, x, y, card?.owner ?? ctx.controller)
    checkStateBased(ctx.state)
  },
})

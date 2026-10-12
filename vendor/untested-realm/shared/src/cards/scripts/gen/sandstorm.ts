import { registerScript } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'

// ---------- auras ----------

// Sandstorm: same storm rules as Blizzard.
registerScript('Sandstorm', {
  auraBlocksAttacks: true,
  auraBlocksIntercepts: true,
  startOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    const card = ctx.state.cards[aura.cardId]
    if (card) toCemetery(ctx.state, card.id)
    delete ctx.state.auras[ctx.sourceId]
    pushLog(ctx.state, ctx.controller, 'The Sandstorm settles.')
  },
})

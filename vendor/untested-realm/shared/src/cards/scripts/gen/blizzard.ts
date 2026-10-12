import { registerScript, type EffectAPI } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'

function dispelSelfAura(ctx: EffectAPI): void {
  const aura = ctx.state.auras[ctx.sourceId]
  if (!aura) return
  const card = ctx.state.cards[aura.cardId]
  if (card) toCemetery(ctx.state, card.id)
  delete ctx.state.auras[ctx.sourceId]
}

// 'Affected sites and units atop them can't be attacked or intercepted.
// At the start of your turn, dispel Blizzard.'
registerScript('Blizzard', {
  auraBlocksAttacks: true,
  auraBlocksIntercepts: true,
  startOfTurn: (ctx) => {
    pushLog(ctx.state, ctx.controller, 'The Blizzard blows over.')
    dispelSelfAura(ctx)
  },
})

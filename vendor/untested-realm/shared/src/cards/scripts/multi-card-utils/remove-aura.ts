import { type EffectAPI } from '../registry'
import { toCemetery } from '../../../engine/effects'

/** send this aura's card to the cemetery and remove the aura from the board */
export function removeAura(ctx: EffectAPI) {
  const aura = ctx.state.auras[ctx.sourceId]
  if (!aura) return
  const card = ctx.state.cards[aura.cardId]
  if (card) toCemetery(ctx.state, card.id)
  delete ctx.state.auras[ctx.sourceId]
}

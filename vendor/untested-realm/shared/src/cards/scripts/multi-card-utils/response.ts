import { type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { toCemetery } from '../../../engine/effects'
import { affinity, meetsThreshold } from '../../../engine/casting'

/** can this hand-response spell be paid for right now? */
export function canRespond(ctx: EffectAPI, cardId: string): boolean {
  const p = ctx.state.players[ctx.controller]
  if (!p.hand.includes(cardId)) return false
  const def = getCard(ctx.state.cards[cardId].name)
  if (p.mana < (def.cost ?? 0)) return false
  return meetsThreshold(affinity(ctx.state, ctx.controller), def.thresholds)
}

/** pay for and discard the response spell */
export function payResponse(ctx: EffectAPI, cardId: string): boolean {
  if (!canRespond(ctx, cardId)) return false
  const p = ctx.state.players[ctx.controller]
  ctx.spendMana(ctx.controller, getCard(ctx.state.cards[cardId].name).cost ?? 0)
  p.hand.splice(p.hand.indexOf(cardId), 1)
  toCemetery(ctx.state, cardId)
  return true
}

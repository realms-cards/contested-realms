import { type EffectAPI } from '../registry'
import { pushLog } from '../../../engine/effects'

/** the plundered card lands in the raider's hand, castable this turn ignoring
 *  threshold; endTurn returns it to its owner's cemetery if uncast */
export function plunderCard(ctx: EffectAPI, cardId: string): void {
  const p = ctx.state.players[ctx.controller]
  p.hand.push(cardId)
  ctx.state.flow = ctx.state.flow ?? {}
  ctx.state.flow.noThresholdCards = [...(ctx.state.flow.noThresholdCards ?? []), cardId]
  ctx.state.flow.plunder = [...(ctx.state.flow.plunder ?? []), { cardId, holder: ctx.controller }]
  pushLog(ctx.state, ctx.controller, `Plundered: ${ctx.state.cards[cardId].name} — castable this turn, threshold be damned.`)
}

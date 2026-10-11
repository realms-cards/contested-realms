import { type EffectAPI } from '../registry'
import type { PlayerId } from '../../../engine/types'

/** lend a card into a player's hand until end of turn */
export function lend(ctx: EffectAPI, cardId: string, returnTo: 'spellbookTop' | 'cemetery' | 'vanish', owner: PlayerId): void {
  ctx.state.players[ctx.controller].hand.push(cardId)
  ctx.state.flow = ctx.state.flow ?? {}
  ctx.state.flow.lends = [...(ctx.state.flow.lends ?? []), { cardId, holder: ctx.controller, returnTo, owner }]
}

import { type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { drawLocked } from './draw-locked'

// 'X and Y Spellcaster / At the end of your turn, this Omphalos draws a spell,
//  which only it can cast. Minions it casts must be summoned here.'
export function omphalosEndOfTurn(ctx: EffectAPI, name: string): void {
  const art = ctx.state.artifacts[ctx.sourceId]
  if (!art) return
  drawLocked(ctx, art.id, `the ${name}`)
  // its minions materialize at the Omphalos itself
  for (const e of (ctx.state.flow?.lockedCards ?? []) as { cardId: string; casterId: string }[]) {
    if (e.casterId !== art.id) continue
    if (getCard(ctx.state.cards[e.cardId].name).type !== 'Minion') continue
    ctx.state.flow.castAtOnly = [
      ...(ctx.state.flow.castAtOnly ?? []).filter((c: any) => c.cardId !== e.cardId),
      // "summoned here" = the Omphalos's own location AND region (it can be buried/submerged)
      { cardId: e.cardId, x: art.x, y: art.y, region: art.region },
    ]
  }
}

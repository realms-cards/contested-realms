import { type EffectAPI } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'

// Sacrifice a catalyst artifact → this turn, bearer's next matching spell requires
// no threshold and costs ③ less to cast (Mix Aer/Terra/Ignis/Aqua, Four Waters of Paradise).
export function sacForDiscount(ctx: EffectAPI, amount: number, elements: string[] | null): void {
  const art = ctx.state.artifacts[ctx.sourceId]
  if (!art) return
  ctx.state.flow = ctx.state.flow ?? {}
  ctx.state.flow.spellDiscounts = [
    ...(ctx.state.flow.spellDiscounts ?? []),
    { player: ctx.controller, turn: ctx.state.turn, amount, noThreshold: true, elements: elements ?? ['Air', 'Earth', 'Fire', 'Water'] },
  ]
  if (art.carriedBy) {
    const bearer = ctx.state.units[art.carriedBy]
    if (bearer) bearer.carrying = bearer.carrying.filter((id) => id !== art.id)
  }
  const card = ctx.state.cards[art.cardId]
  if (card) toCemetery(ctx.state, card.id)
  delete ctx.state.artifacts[art.id]
  pushLog(ctx.state, ctx.controller, `${art.name} dissolves into raw potential.`)
}

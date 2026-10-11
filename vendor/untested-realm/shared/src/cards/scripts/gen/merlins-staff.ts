import { registerScript } from '../registry'
import { getCard } from '../../db'

// 'Bearer has Spellcaster and +1 power for each magic spell they've cast this
//  turn while holding Merlin's Staff.'
registerScript("Merlin's Staff", {
  bearerKeywords: ['spellcaster'],
  artifactGrantsPower: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    return art?.carriedBy === unit.id ? art.counters?.castsThisTurn ?? 0 : 0
  },
  onSpellCast: (ctx, by, cardName) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (!art || !art.carriedBy || by !== ctx.controller) return
    if (getCard(cardName).type !== 'Magic') return
    art.counters = { ...art.counters, castsThisTurn: (art.counters?.castsThisTurn ?? 0) + 1 }
  },
  startOfTurn: (ctx) => {
    const art = ctx.state.artifacts[ctx.sourceId]
    if (art?.counters) art.counters.castsThisTurn = 0
  },
})

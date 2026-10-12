import { registerScript } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'

// 'Minions occupying affected sites lose Airborne and are Immobile. Lasts 3 of
//  your turns.'
registerScript('Entangle Terrain', {
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (aura) aura.counters = { turns: 3 }
  },
  removesKeywords: (state, selfId, unit) => {
    const aura = state.auras[selfId]
    if (!aura || unit.isAvatar || unit.region !== 'surface') return []
    return aura.squares.some((s) => s.x === unit.x && s.y === unit.y && siteAt(state, s.x, s.y)) ? ['airborne'] : []
  },
  auraGrantsKeywords: (state, aura, unit) => {
    if (unit.isAvatar || unit.region !== 'surface') return []
    return aura.squares.some((s) => s.x === unit.x && s.y === unit.y && siteAt(state, s.x, s.y)) ? ['immobile'] : []
  },
  startOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    aura.counters = aura.counters ?? { turns: 3 }
    aura.counters.turns -= 1
    if (aura.counters.turns <= 0) {
      const card = ctx.state.cards[aura.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.auras[ctx.sourceId]
      pushLog(ctx.state, ctx.controller, 'The entangling vines wither away.')
    }
  },
})

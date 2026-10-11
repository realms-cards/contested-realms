import { registerScript } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'

// 'Mortals here are disabled and each give +1 power to all Faeries here.
//  Dispel if there are no Faeries here.'
registerScript("A Midsummer Night's Dream", {
  auraDisablesUnit: (state, aura, unit) => {
    if (unit.isAvatar || unit.region !== 'surface') return false
    if (!aura.squares.some((s) => s.x === unit.x && s.y === unit.y)) return false
    return effSubtypes(state, unit).includes('Mortal')
  },
  auraGrantsPower: (state, aura, unit) => {
    if (unit.isAvatar || unit.region !== 'surface') return 0
    if (!aura.squares.some((s) => s.x === unit.x && s.y === unit.y)) return 0
    if (!effSubtypes(state, unit).includes('Faerie')) return 0
    let mortals = 0
    for (const sq of aura.squares) {
      for (const u of unitsAt(state, sq.x, sq.y, 'surface')) {
        if (!u.isAvatar && effSubtypes(state, u).includes('Mortal')) mortals++
      }
    }
    return mortals
  },
  endOfEveryTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    const fae = aura.squares.some((sq) =>
      unitsAt(ctx.state, sq.x, sq.y, 'surface').some((u) => !u.isAvatar && effSubtypes(ctx.state, u).includes('Faerie')),
    )
    if (!fae) {
      const card = ctx.state.cards[aura.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.auras[ctx.sourceId]
      pushLog(ctx.state, ctx.controller, 'With no Faeries left to dream it, the Dream fades.')
    }
  },
})

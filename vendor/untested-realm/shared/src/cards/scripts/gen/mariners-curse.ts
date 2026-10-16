import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, trySubmerge } from '../../../engine/effects'
import { isWaterSite, siteAt } from '../../../engine/grid'

// 'Whenever a minion enters an affected water site, submerge it and return
//  Mariner's Curse to its owner's hand.'
registerScript("Mariner's Curse", {
  onUnitEntersSquare: (ctx, moved, from) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura || moved.isAvatar || moved.region !== 'surface') return
    // surfacing (or submerging) within the SAME site is not "entering" it — as for Giant Shark
    if (from && from.x === moved.x && from.y === moved.y) return
    if (!aura.squares.some((s) => s.x === moved.x && s.y === moved.y)) return
    const site = siteAt(ctx.state, moved.x, moved.y)
    if (!site || !isWaterSite(ctx.state, site, getCard)) return
    if (!trySubmerge(ctx.state, moved)) return
    pushLog(ctx.state, ctx.controller, `${moved.name} is pulled beneath the waves.`)
    const card = ctx.state.cards[aura.cardId]
    if (ctx.state.auras[aura.id]) {
      if (card && !card.isToken) ctx.state.players[card.owner].hand.push(card.id)
      delete ctx.state.auras[aura.id]
    }
  },
})

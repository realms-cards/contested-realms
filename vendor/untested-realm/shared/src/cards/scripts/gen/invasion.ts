import { registerScript } from '../registry'
import { siteAt, unitsAt } from '../../../engine/grid'
import { pushLog, toCemetery } from '../../../engine/effects'

// 'At the end of your turn, summon a Foot Soldier token to each affected enemy
// site with no units. Lasts 3 of your turns.'
registerScript('Invasion', {
  genesis: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (aura) aura.counters = { turns: 3 }
  },
  endOfTurn: (ctx) => {
    const aura = ctx.state.auras[ctx.sourceId]
    if (!aura) return
    for (const sq of aura.squares) {
      const site = siteAt(ctx.state, sq.x, sq.y)
      if (site && site.controller !== null && site.controller !== ctx.controller && unitsAt(ctx.state, sq.x, sq.y).length === 0) {
        ctx.summonToken('Foot Soldier', ctx.controller, sq.x, sq.y)
      }
    }
    aura.counters = aura.counters ?? { turns: 3 }
    aura.counters.turns -= 1
    if (aura.counters.turns <= 0) {
      const card = ctx.state.cards[aura.cardId]
      if (card) toCemetery(ctx.state, card.id)
      delete ctx.state.auras[aura.id]
      pushLog(ctx.state, ctx.controller, 'The invasion subsides.')
    }
  },
})

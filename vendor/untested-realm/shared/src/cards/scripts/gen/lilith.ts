import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit, revealCards } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// "At the end of your turn, reveal opponent's top spell. If it's a minion, summon
// it here. Otherwise, put it at the bottom of the deck."
registerScript('Lilith', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const opp = (1 - ctx.controller) as PlayerId
    const p = ctx.state.players[opp]
    const id = p.spellbook.shift()
    if (id === undefined) return
    const name = ctx.state.cards[id].name
    pushLog(ctx.state, ctx.controller, `Lilith reveals ${p.name}'s ${name}.`)
    if (getCard(name).type === 'Minion') {
      const unitId = `u${ctx.state.nextId++}`
      // the seduced minion enters the realm under your control → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId: id, name, owner: opp, controller: ctx.controller,
        isAvatar: false, x: self.x, y: self.y, region: self.region, tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      pushLog(ctx.state, ctx.controller, `${name} is seduced into service.`)
    } else {
      // not a minion → not summoned, just buried at the bottom → reveal it (nothing else shows it).
      revealCards(ctx.state, ctx.controller, [name])
      p.spellbook.push(id)
    }
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { effectSummonUnit, revealCards } from '../../../engine/effects'

// "At the start of your turn, reveal your topmost spell. If it's a minion, you may summon it here."
registerScript('Mother Nature', {
  startOfTurn: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const topId = p.spellbook[0]
    if (topId === undefined) return
    const name = ctx.state.cards[topId].name
    ctx.log(`Mother Nature reveals ${name}.`)
    // a non-minion is never summoned → reveal it to the opponent (a summon would show it itself).
    if (getCard(name).type !== 'Minion') { revealCards(ctx.state, ctx.controller, [name]); return }
    ctx.ask({ kind: 'yesNo', title: `Summon ${name} at Mother Nature's location?`, data: { reveal: name } }, 'summonTop')
  },
  conts: {
    summonTop: (ctx, contCtx, choice) => {
      const p0 = ctx.state.players[ctx.controller]
      const top0 = p0.spellbook[0]
      // declined the summon → the spell stays hidden on top, so reveal it (the card still "revealed" it).
      if (!choice) { if (top0 !== undefined) revealCards(ctx.state, ctx.controller, [ctx.state.cards[top0].name]); return }
      const self = ctx.state.units[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      const topId = p.spellbook[0]
      if (!self || topId === undefined) return
      const card = ctx.state.cards[topId]
      if (getCard(card.name).type !== 'Minion') return
      p.spellbook.shift()
      const unitId = `u${ctx.state.nextId++}`
      // summoned into the realm → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId: topId, name: card.name, owner: card.owner, controller: ctx.controller,
        isAvatar: false, x: self.x, y: self.y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      ctx.log(`Mother Nature summons ${card.name}.`)
    },
  },
})

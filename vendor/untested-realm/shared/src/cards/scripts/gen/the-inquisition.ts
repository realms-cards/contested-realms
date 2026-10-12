import { registerScript, type EffectAPI } from '../registry'
import { pushLog, opponent, newId, revealHand, effectSummonUnit } from '../../../engine/effects'
import { siteAt, sitesOf } from '../../../engine/grid'
import type { GameState, PlayerId, UnitState } from '../../../engine/types'

// ------------------------------------------------------------- The Inquisition ----
// 'When an opponent can see this card in your hand or spellbook, you may summon it.
//  Genesis → Target opponent reveals their hand. You may banish a card from it.'
function inquisitionSummon(state: GameState, cardId: string, owner: PlayerId) {
  if (!((state.flow?.revealedCards ?? []) as string[]).includes(cardId)) return []
  return [{
    key: `inq:${cardId}`,
    label: 'Summon The Inquisition (nobody expects it)',
    cost: {},
    contOwner: 'The Inquisition',
    effect: (ctx: EffectAPI) => {
      const squares = sitesOf(ctx.state, owner).filter((s) => !s.isRubble).map((s) => ({ x: s.x, y: s.y }))
      if (!squares.length) return ctx.log('No site to summon to.')
      ctx.ask({ kind: 'chooseSquare', title: 'The Inquisition arrives where?', data: { squares } }, 'inq:place', { cardId, owner })
    },
  }]
}

registerScript('The Inquisition', {
  handAbilities: (state, cardId, owner) => inquisitionSummon(state, cardId, owner),
  spellbookAbilities: (state, cardId, owner) => inquisitionSummon(state, cardId, owner),
  genesis: (ctx) => {
    const opp = opponent(ctx.controller)
    const p = ctx.state.players[opp]
    const names = p.hand.map((id) => ctx.state.cards[id].name)
    revealHand(ctx.state, opp, ctx.controller) // caster sees the hand face-up
    pushLog(ctx.state, ctx.controller, `${p.name} reveals their hand.`)
    ctx.state.flow = ctx.state.flow ?? {}
    ctx.state.flow.revealedCards = [...new Set([...(ctx.state.flow.revealedCards ?? []), ...p.hand])]
    if (!names.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Banish a card from their hand? (skip for mercy)', data: { cards: names, pick: 1, upTo: true } },
      'purge',
      { opp },
    )
  },
  conts: {
    purge: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const p = ctx.state.players[c.opp as PlayerId]
      if (typeof idx !== 'number' || idx < 0 || idx >= p.hand.length) return
      const [id] = p.hand.splice(idx, 1)
      p.banished.push(id)
      pushLog(ctx.state, ctx.controller, `${ctx.state.cards[id].name} is banished by The Inquisition.`)
    },
    'inq:place': (ctx, c, choice) => {
      const sq = choice as { x: number; y: number }
      const owner = c.owner as PlayerId
      const cardId = c.cardId as string
      const p = ctx.state.players[owner]
      if (!sq || !siteAt(ctx.state, sq.x, sq.y)) return
      const inHand = p.hand.indexOf(cardId)
      const inBook = p.spellbook.indexOf(cardId)
      if (inHand >= 0) p.hand.splice(inHand, 1)
      else if (inBook >= 0) p.spellbook.splice(inBook, 1)
      else return
      const unitId = newId(ctx.state, 'u')
      const unit: UnitState = {
        id: unitId, cardId, name: ctx.state.cards[cardId]?.name ?? 'The Inquisition', owner: ctx.state.cards[cardId].owner, controller: owner,
        isAvatar: false, x: sq.x, y: sq.y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        counters: { castFromHand: 1 },
      }
      pushLog(ctx.state, owner, '🔥 NOBODY expects The Inquisition!')
      // enters the realm from hand/spellbook → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, unit)
    },
  },
})

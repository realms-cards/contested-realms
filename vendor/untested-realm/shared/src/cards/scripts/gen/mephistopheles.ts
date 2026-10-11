import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, newId, effectSummonUnit } from '../../../engine/effects'
import { avatarOf, siteAt, adjacentSquaresW } from '../../../engine/grid'
import { isEvilCardNameFor } from '../../../engine/statics'
import type { UnitState } from '../../../engine/types'

// ------------------------------------------------------- Mephistopheles ----
// 'Must be cast to your Avatar's location, taking their life and replacing
//  them as your Avatar. / Once on your turn, you may summon an Evil minion
//  from your hand to an adjacent site.'
registerScript('Mephistopheles', {
  summonFilter: (state, player, at) => {
    const av = avatarOf(state, player)
    return av && at.x === av.x && at.y === av.y ? null : "Mephistopheles must be cast to your Avatar's location."
  },
  // NOT a Genesis ability. Card text: "Must be cast to your Avatar's location,
  // taking their life and replacing them as your Avatar." The FAQ is explicit:
  // "If you manage to summon Mephistopheles without casting him, then he will not
  // replace your avatar, but his second ability will still function"
  // (faq_dump.md:1954). So this rider fires ONLY on a real cast (castRider),
  // never on an effect-summon — which is why it must NOT live in `genesis`.
  castRider: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    const p = ctx.state.players[ctx.controller]
    const old = avatarOf(ctx.state, ctx.controller)
    if (!self || !old || old.id === self.id) return
    self.isAvatar = true
    self.life = old.life
    // FAQ: "Your current and maximum life remain the same" (faq_dump.md:1953).
    // maxLife derives from the avatar's card name (effects.ts gainLife), but
    // getCard('Mephistopheles').life is undefined (he's a Minion) → the cap would
    // silently collapse to 20. Persist the ORIGINAL avatar's maximum on the unit.
    self.counters = {
      ...(self.counters ?? {}),
      maxLife: old.counters?.maxLife ?? getCard(old.name).life ?? 20,
    }
    self.deathsDoor = old.deathsDoor
    self.doorTurn = old.doorTurn
    self.damage = 0
    // the devil inherits the wardrobe
    for (const artId of old.carrying) {
      const art = ctx.state.artifacts[artId]
      if (art) {
        art.carriedBy = self.id
        self.carrying.push(artId)
      }
    }
    old.carrying = []
    p.avatarUnitId = self.id
    const oc = ctx.state.cards[old.cardId]
    delete ctx.state.units[old.id]
    if (oc) ctx.state.players[oc.owner].banished.push(oc.id)
    pushLog(ctx.state, ctx.controller, `😈 Mephistopheles takes ${old.name}'s life — and their throne (${self.life} life).`)
  },
  abilities: [{
    key: 'meph:summon',
    label: 'Summon an Evil minion from your hand to an adjacent site',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const p = ctx.state.players[ctx.controller]
      const evils = p.hand.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion' && isEvilCardNameFor(ctx.state, ctx.controller, ctx.state.cards[id].name))
      if (!evils.length) return ctx.log('No Evil minion waits in your hand.')
      ctx.ask(
        { kind: 'chooseCards', title: 'Mephistopheles beckons which Evil minion?', data: { cards: evils.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
        'pick',
        { evils },
      )
    },
  }],
  conts: {
    pick: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      if (typeof idx !== 'number' || !self) return
      const cardId = (c.evils as string[])[idx]
      if (!cardId) return
      const squares = adjacentSquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y))
      if (!squares.length) return ctx.log('No adjacent site to summon to.')
      ctx.ask({ kind: 'chooseSquare', title: 'Summon where?', data: { squares } }, 'place', { cardId })
    },
    place: (ctx, c, choice) => {
      const sq = choice as { x: number; y: number }
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      if (!p.hand.includes(cardId) || !sq || !siteAt(ctx.state, sq.x, sq.y)) return
      p.hand.splice(p.hand.indexOf(cardId), 1)
      const name = ctx.state.cards[cardId].name
      const unitId = newId(ctx.state, 'u')
      const unit: UnitState = {
        id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
        isAvatar: false, x: sq.x, y: sq.y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        counters: { castFromHand: 1 },
      }
      pushLog(ctx.state, ctx.controller, `${name} answers the devil's call.`)
      // the Evil minion enters the realm from hand → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, unit)
    },
  },
})

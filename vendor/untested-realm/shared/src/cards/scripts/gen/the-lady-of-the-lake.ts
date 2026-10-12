import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit, removeUnitFromRealm, returnToDeck } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// 'Genesis → You may summon a Mortal or artifact from your cemetery to Lady of
//  the Lake's location. If you do, shuffle her into her owner's spellbook.'
registerScript('The Lady of the Lake', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const gifts = p.cemetery.filter((id) => {
      const def = getCard(ctx.state.cards[id].name)
      return def.type === 'Artifact' || (def.type === 'Minion' && def.subtypes.includes('Mortal'))
    })
    if (!gifts.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'The Lady offers back which treasure? (skip for none)', data: { cards: gifts.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'gift',
      { gifts },
    )
  },
  conts: {
    gift: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const cardId = (c.gifts as string[])[idx]
      const self = ctx.state.units[ctx.sourceId]
      const p = ctx.state.players[ctx.controller]
      if (!self || !p.cemetery.includes(cardId)) return
      p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
      const name = ctx.state.cards[cardId].name
      const def = getCard(name)
      if (def.type === 'Artifact') {
        const artId = `a${ctx.state.nextId++}`
        ctx.state.artifacts[artId] = {
          id: artId, cardId, name, conjuredBy: ctx.controller,
          x: self.x, y: self.y, region: self.region, carriedBy: null, tapped: false,
        }
      } else {
        const unitId = `u${ctx.state.nextId++}`
        // the gift minion enters the realm → Genesis fires (FAQ 1242)
        effectSummonUnit(ctx.state, {
          id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
          isAvatar: false, x: self.x, y: self.y, region: 'surface', tapped: false, damage: 0,
          enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        })
      }
      pushLog(ctx.state, ctx.controller, `${name} rises from the lake — and the Lady sinks away.`)
      // she returns to the spellbook
      const herCard = ctx.state.cards[self.cardId]
      if (removeUnitFromRealm(ctx.state, self.id)) delete ctx.state.units[self.id] // cargo stays (FAQ); avatars refuse removal
      if (herCard && !herCard.isToken) {
        const owner = returnToDeck(ctx.state, herCard.id) // her OWNER's deck, regardless of controller
        ctx.state.seed = shuffleWithSeed(ctx.state.players[owner].spellbook, ctx.state.seed)
      }
    },
  },
})

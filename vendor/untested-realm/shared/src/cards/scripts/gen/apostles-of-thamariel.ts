import { registerScript } from '../registry'
import { getCard } from '../../db'
import { effectSummonUnit } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// Dhol Chants (tap nearby allies → reveal that many spells → cast one free) is
// implemented in m36.ts via flow.freeCast.

// 'Genesis → Search your top five spells for a minion to discard. Bottom the rest.'
// (Forgotten Tomb was implemented with chooseOption in m5 — upgraded UI not needed)

// 'Search your top seven spells. You may summon an Angel from among them, then
// shuffle. The Angel is banished if the Apostles ever leave the realm.' —
// leash aside, the reveal+summon is now implementable:
registerScript('Apostles of Thamariel', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.slice(0, 7)
    const angels = top.filter((id) => getCard(ctx.state.cards[id].name).subtypes.includes('Angel'))
    if (!angels.length) {
      ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
      return ctx.log('No Angel among the top seven.')
    }
    // peeked cards ride the prompt ctx (hidden from the opponent), never synced flow (see Browse)
    ctx.ask(
      { kind: 'chooseCards', title: 'Summon which Angel?', data: { cards: angels.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'call',
      { pool: top },
    )
  },
  conts: {
    call: (ctx, c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const self = ctx.state.units[ctx.sourceId]
      const top: string[] = (c.pool as string[]) ?? []
      const angels = top.filter((id) => getCard(ctx.state.cards[id].name).subtypes.includes('Angel'))
      const idx = Array.isArray(choice) ? choice[0] : -1
      const chosen = idx >= 0 ? angels[idx] : undefined
      if (chosen !== undefined && self) {
        p.spellbook = p.spellbook.filter((id) => id !== chosen)
        const unitId = `u${ctx.state.nextId++}`
        // the Angel enters the realm from the spellbook → Genesis fires (FAQ 1242)
        effectSummonUnit(ctx.state, {
          id: unitId, cardId: chosen, name: ctx.state.cards[chosen].name, owner: ctx.state.cards[chosen].owner,
          controller: ctx.controller, isAvatar: false, x: self.x, y: self.y, region: self.region,
          tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
          carryingUnits: [], usedThisTurn: {},
        })
        // the leash: banish the Angel if the Apostles leave the realm
        ctx.state.flow.leashes = [...(ctx.state.flow.leashes ?? []), { unitId, anchorId: self.id }]
      }
      ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
    },
  },
})

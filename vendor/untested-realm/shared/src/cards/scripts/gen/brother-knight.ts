import { registerScript } from '../registry'
import { effectSummonUnit } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// 'Genesis → You may search your spellbook or hand for another Brother Knight and
// summon it here. Shuffle if needed.'
registerScript('Brother Knight', {
  genesis: (ctx) => {
    ctx.ask({ kind: 'yesNo', title: 'Call the other Brother Knight?' }, 'brother')
  },
  conts: {
    brother: (ctx, _c, choice) => {
      if (!choice) return
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const p = ctx.state.players[ctx.controller]
      for (const zone of ['hand', 'spellbook'] as const) {
        const idx = p[zone].findIndex((id) => ctx.state.cards[id].name === 'Brother Knight')
        if (idx >= 0) {
          const [cardId] = p[zone].splice(idx, 1)
          const unitId = `u${ctx.state.nextId++}`
          // the other Brother Knight enters the realm → its own Genesis fires too
          // (FAQ 1242). Self-limiting: each call consumes a copy from hand/spellbook,
          // so the genesis→summon chain ends when no copies remain.
          effectSummonUnit(ctx.state, {
            id: unitId, cardId, name: 'Brother Knight', owner: ctx.state.cards[cardId].owner,
            controller: ctx.controller, isAvatar: false, x: self.x, y: self.y, region: self.region,
            tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
            carryingUnits: [], usedThisTurn: {},
          })
          if (zone === 'spellbook') ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
          return
        }
      }
      ctx.log('The other Brother Knight is nowhere to be found.')
    },
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { effectSummonUnit } from '../../../engine/effects'
import { shuffleWithSeed } from '../../../engine/rng'

// 'Genesis â†’ You may search your hand and spellbook for a Beast with Airborne and
// mana cost â‘¡ or less and summon it here. Shuffle if needed.'
registerScript('Highland Falconer', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const isFalcon = (name: string) => {
      const d = getCard(name)
      return d.type === 'Minion' && d.subtypes.includes('Beast') && (d.cost ?? 99) <= 2 && /airborne/i.test(d.text)
    }
    const options = [...new Set([...p.hand, ...p.spellbook].map((id) => ctx.state.cards[id].name).filter(isFalcon))]
    if (!options.length) return
    ctx.ask({ kind: 'chooseOption', title: 'Call which winged Beast?', data: { options: [...options, '(none)'] } }, 'call')
  },
  conts: {
    call: (ctx, _c, choice) => {
      if (!choice || choice === '(none)') return
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const p = ctx.state.players[ctx.controller]
      for (const zone of ['hand', 'spellbook'] as const) {
        const idx = p[zone].findIndex((id) => ctx.state.cards[id].name === choice)
        if (idx >= 0) {
          const [cardId] = p[zone].splice(idx, 1)
          const unitId = `u${ctx.state.nextId++}`
          // summoned into the realm â†’ Genesis fires (FAQ 1242)
          effectSummonUnit(ctx.state, {
            id: unitId, cardId, name: String(choice), owner: ctx.state.cards[cardId].owner,
            controller: ctx.controller, isAvatar: false, x: self.x, y: self.y, region: self.region,
            tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
            carryingUnits: [], usedThisTurn: {},
          })
          if (zone === 'spellbook') ctx.state.seed = shuffleWithSeed(p.spellbook, ctx.state.seed)
          return
        }
      }
    },
  },
})

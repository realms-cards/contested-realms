import { registerScript } from '../registry'
import { getCard } from '../../db'
import { hasSubtype } from '../../../engine/statics'
import { effectSummonUnit } from '../../../engine/effects'
import { isKnightSirDame } from '../multi-card-utils/knightly'

// 'If you control an Ordinary Mortal, you may summon a Knight, Sir, or Dame from
// your hand to their location.'
registerScript('Knighthood', {
  onCast: (ctx) => {
    const squires = Object.values(ctx.state.units).filter(
      (u) => u.controller === ctx.controller && !u.isAvatar && getCard(u.name).rarity === 'Ordinary' && hasSubtype(ctx.state, u, 'Mortal'),
    )
    if (squires.length === 0) return ctx.log('You control no Ordinary Mortal.')
    const p = ctx.state.players[ctx.controller]
    const knights = [...new Set(p.hand.map((id) => ctx.state.cards[id].name).filter((n) =>
      getCard(n).type === 'Minion' && isKnightSirDame(n),
    ))]
    if (!knights.length) return ctx.log('No Knight, Sir, or Dame in hand.')
    if (squires.length === 1) {
      ctx.ask({ kind: 'chooseOption', title: 'Dub which champion?', data: { options: knights } }, 'dub', { x: squires[0].x, y: squires[0].y })
      return
    }
    // "summon ... to THEIR location" — the caster chooses which Ordinary Mortal
    ctx.ask({ kind: 'chooseTargets', title: 'Summon the champion to which Ordinary Mortal?', data: { candidates: squires.map((u) => u.id), count: 1, kind: 'unit' } }, 'pickSquire', { knights })
  },
  conts: {
    pickSquire: (ctx, contCtx, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const sq = id ? ctx.state.units[id] : null
      if (!sq) return
      ctx.ask({ kind: 'chooseOption', title: 'Dub which champion?', data: { options: contCtx.knights } }, 'dub', { x: sq.x, y: sq.y })
    },
    dub: (ctx, contCtx, choice) => {
      const p = ctx.state.players[ctx.controller]
      const idx = p.hand.findIndex((id) => ctx.state.cards[id].name === choice)
      if (idx < 0) return
      const [cardId] = p.hand.splice(idx, 1)
      const unitId = `u${ctx.state.nextId++}`
      // the dubbed champion enters the realm from hand → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name: String(choice), owner: ctx.state.cards[cardId].owner,
        controller: ctx.controller, isAvatar: false, x: contCtx.x, y: contCtx.y, region: 'surface',
        tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [],
        carryingUnits: [], usedThisTurn: {},
      })
    },
  },
})

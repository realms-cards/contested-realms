import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Summon each other dead Voidwalk minion to a nearby site or void.'
registerScript('Ultimate Horror', {
  genesis: (ctx) => horrorNext(ctx),
  conts: {
    rise: (ctx, c, sq) => {
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      const self = ctx.state.units[ctx.sourceId]
      if (sq && self && p.cemetery.includes(cardId) && nearbySquaresW(ctx.state, self.x, self.y).some((s) => s.x === sq.x && s.y === sq.y)) {
        p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
        const name = ctx.state.cards[cardId].name
        const unitId = `u${ctx.state.nextId++}`
        const region = siteAt(ctx.state, sq.x, sq.y) ? 'surface' : 'void'
        // each dead Voidwalk minion re-enters the realm → its Genesis fires (FAQ 1242)
        effectSummonUnit(ctx.state, {
          id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
          isAvatar: false, x: sq.x, y: sq.y, region, tapped: false, damage: 0,
          enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        })
        pushLog(ctx.state, ctx.controller, `${name} crawls back from beyond.`)
      }
      horrorNext(ctx)
    },
  },
})

function horrorNext(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const p = ctx.state.players[ctx.controller]
  const next = p.cemetery.find((id) => {
    const def = getCard(ctx.state.cards[id].name)
    return def.type === 'Minion' && /voidwalk/i.test(def.text) && ctx.state.cards[id].name !== 'Ultimate Horror'
  })
  if (!next) return
  const squares = nearbySquaresW(ctx.state, self.x, self.y)
  ctx.ask({ kind: 'chooseSquare', title: `Summon ${ctx.state.cards[next].name} to which nearby square?`, data: { squares } }, 'rise', { cardId: next })
}

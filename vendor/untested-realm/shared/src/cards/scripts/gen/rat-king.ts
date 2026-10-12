import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt, squareLabel } from '../../../engine/grid'

// 'Genesis & Deathrite → Search your top six spells. You may summon an Ordinary
//  rat from among them to each other adjacent site. Put the rest at the bottom.'
registerScript('Rat King', {
  genesis: (ctx) => ratScurry(ctx),
  deathrite: (ctx) => ratScurry(ctx),
  conts: {
    scurry: (ctx, c, choice) => {
      const idxs = (Array.isArray(choice) ? choice : []).filter((i): i is number => typeof i === 'number')
      const top = c.top as string[]
      const spots = c.spots as { x: number; y: number }[]
      const p = ctx.state.players[ctx.controller]
      p.spellbook = p.spellbook.filter((id) => !top.includes(id))
      const used: string[] = []
      for (let k = 0; k < Math.min(idxs.length, spots.length); k++) {
        const cardId = top[idxs[k]]
        if (!cardId || used.includes(cardId)) continue
        const def = getCard(ctx.state.cards[cardId].name)
        if (def.type !== 'Minion' || def.rarity !== 'Ordinary' || !/rat/i.test(ctx.state.cards[cardId].name)) continue
        used.push(cardId)
        const unitId = `u${ctx.state.nextId++}`
        // the rat enters the realm from the spellbook → Genesis fires (FAQ 1242)
        effectSummonUnit(ctx.state, {
          id: unitId, cardId, name: ctx.state.cards[cardId].name, owner: ctx.state.cards[cardId].owner,
          controller: ctx.controller, isAvatar: false, x: spots[k].x, y: spots[k].y, region: 'surface',
          tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        })
        pushLog(ctx.state, ctx.controller, `${ctx.state.cards[cardId].name} scurries to ${squareLabel(spots[k].x, spots[k].y)}.`)
      }
      const rest = top.filter((id) => !used.includes(id))
      p.spellbook.push(...rest)
    },
  },
})

function ratScurry(ctx: EffectAPI): void {
  const self = ctx.state.units[ctx.sourceId]
  if (!self) return
  const p = ctx.state.players[ctx.controller]
  const top = p.spellbook.slice(0, 6)
  if (!top.length) return
  const spots = orthAdjacentWrapped(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y))
  if (!spots.length) return
  ctx.ask(
    { kind: 'chooseCards', title: `Rat King: summon which Ordinary rats (one per adjacent site, ${spots.length} sites)?`, data: { cards: top.map((id) => ctx.state.cards[id].name), pick: Math.min(spots.length, top.length), upTo: true } },
    'scurry',
    { top, spots },
  )
}

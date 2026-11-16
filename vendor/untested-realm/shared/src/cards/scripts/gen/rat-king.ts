import { registerScript, type EffectAPI } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { orthAdjacentWrapped, siteAt, squareLabel } from '../../../engine/grid'
import { noteAddedToEnd } from '../../../engine/knowledge'

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
      const rats: string[] = []
      for (const i of idxs) {
        const cardId = top[i]
        if (!cardId || rats.includes(cardId) || rats.length >= spots.length) continue
        const def = getCard(ctx.state.cards[cardId].name)
        if (def.type !== 'Minion' || def.rarity !== 'Ordinary' || !/rat/i.test(ctx.state.cards[cardId].name)) continue
        rats.push(cardId)
      }
      // The rest go to the bottom now; the chosen rats wait on top until each is given its site.
      const rest = top.filter((id) => !rats.includes(id))
      p.spellbook = p.spellbook.filter((id) => !rest.includes(id))
      noteAddedToEnd(ctx.state, ctx.controller, ctx.controller, 'spellbook', 'bottom', rest, () => p.spellbook.push(...rest))
      placeRat(ctx, rats, spots)
    },
    // the player picks which adjacent site each rat goes to, one rat at a time.
    place: (ctx, c, choice) => {
      const rats = c.rats as string[]
      const spots = c.spots as { x: number; y: number }[]
      const spot = choice && typeof choice.x === 'number' ? spots.find((s) => s.x === choice.x && s.y === choice.y) : undefined
      if (!rats.length || !spot) return
      summonRat(ctx, rats[0], spot)
      placeRat(ctx, rats.slice(1), spots.filter((s) => s !== spot))
    },
  },
})

/** Summons the next chosen rat: straight to the last open site, or asks which site when there's a choice. */
function placeRat(ctx: EffectAPI, rats: string[], spots: { x: number; y: number }[]): void {
  const open = spots.filter((s) => siteAt(ctx.state, s.x, s.y))
  if (!rats.length || !open.length) return
  if (open.length === 1) {
    summonRat(ctx, rats[0], open[0])
    return
  }
  const name = ctx.state.cards[rats[0]].name
  ctx.ask({ kind: 'chooseSquare', title: `Rat King: summon ${name} to which adjacent site?`, data: { squares: open.map((s) => ({ x: s.x, y: s.y })) } },
    'place', { rats, spots: open })
}

function summonRat(ctx: EffectAPI, cardId: string, spot: { x: number; y: number }): void {
  const p = ctx.state.players[ctx.controller]
  if (!p.spellbook.includes(cardId)) return
  p.spellbook = p.spellbook.filter((id) => id !== cardId)
  const unitId = `u${ctx.state.nextId++}`
  // the rat enters the realm from the spellbook → Genesis fires (FAQ 1242)
  effectSummonUnit(ctx.state, {
    id: unitId, cardId, name: ctx.state.cards[cardId].name, owner: ctx.state.cards[cardId].owner,
    controller: ctx.controller, isAvatar: false, x: spot.x, y: spot.y, region: 'surface',
    tapped: false, damage: 0, enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  })
  pushLog(ctx.state, ctx.controller, `${ctx.state.cards[cardId].name} scurries to ${squareLabel(spot.x, spot.y)}.`)
}

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

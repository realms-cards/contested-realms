import { registerScript } from '../registry'
import { getCard } from '../../db'
import { toCemetery, discardableHandIds } from '../../../engine/effects'
import { GRID_H, GRID_W, unitsAt } from '../../../engine/grid'
import { stepDistanceW } from '../../../engine/movement'
import type { Region } from '../../../engine/types'

// 'Tap bearer and another ally here, Discard a card → Deal damage equal to the
//  discarded card's mana cost to each unit at target location up to three steps away.'
registerScript('Payload Trebuchet', {
  abilities: [{
    key: 'trebuchet',
    label: 'Tap crew + discard → payload strike (≤3 steps)',
    cost: {},
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!art || !bearer || bearer.tapped) return ctx.log('No ready bearer.')
      const crew = unitsAt(ctx.state, bearer.x, bearer.y, bearer.region).filter(
        (u) => u.id !== bearer.id && u.controller === ctx.controller && !u.tapped,
      )
      const hand = discardableHandIds(ctx.state, ctx.controller) // a caster-locked card (Morgana/Omphalos) can't be launched
      if (!crew.length || !hand.length) return ctx.log('Need a second crew member and a card to launch.')
      ctx.ask({ kind: 'chooseTargets', title: 'Who loads the trebuchet?', data: { candidates: crew.map((u) => u.id), count: 1, upTo: false, kind: 'unit' } }, 'load')
    },
  }],
  conts: {
    load: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      const helper = typeof id === 'string' ? ctx.state.units[id] : null
      if (!bearer || !helper || bearer.tapped || helper.tapped) return
      bearer.tapped = true
      helper.tapped = true
      const ids = discardableHandIds(ctx.state, ctx.controller) // exclude caster-locked cards; resolve by id
      ctx.ask({ kind: 'chooseCards', title: 'Launch which card as the payload?', data: { cards: ids.map((i) => ctx.state.cards[i].name), pick: 1, upTo: false } }, 'payload', { ids })
    },
    payload: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const p = ctx.state.players[ctx.controller]
      const ids = (c.ids as string[]) ?? []
      const cardId = typeof idx === 'number' && idx >= 0 && idx < ids.length ? ids[idx] : undefined
      if (!cardId || !p.hand.includes(cardId)) return
      p.hand = p.hand.filter((h) => h !== cardId)
      toCemetery(ctx.state, cardId)
      const dmg = getCard(ctx.state.cards[cardId].name).cost ?? 0
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer) return
      const squares: { x: number; y: number }[] = []
      for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (stepDistanceW(ctx.state, { x, y }, bearer) <= 3) squares.push({ x, y }) // "up to three steps away" (def. 1)
      ctx.ask({ kind: 'chooseSquare', title: `The ${dmg}-damage payload lands where?`, data: { squares } }, 'impact', { dmg, region: bearer.region })
    },
    impact: (ctx, c, sq) => {
      if (!sq) return
      // the impact is region-locked to the bearer that launched it
      for (const u of unitsAt(ctx.state, sq.x, sq.y, c.region as Region)) ctx.dealDamage({ unit: u.id }, c.dmg as number)
    },
  },
})

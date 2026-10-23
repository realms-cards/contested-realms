import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit, removeUnitFromRealm } from '../../../engine/effects'
import { siteAt } from '../../../engine/grid'
import { effKeywords, cemeteryProtected, payZoneToll, zoneAccessToll } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'Once on your turn, Spellcaster bearer may cast a dead minion. It becomes
//  Undead instead and is banished if it dies.'
registerScript('Book of the Dead', {
  subtypeOverride: (_state, _selfId, unit, st) =>
    unit.counters?.bookRisen && !st.includes('Undead') ? [...st, 'Undead'] : st,
  onWouldDie: (state, _selfId, dying) => {
    if (!dying.counters?.bookRisen) return false
    // banished instead of dying
    const card = state.cards[dying.cardId]
    if (removeUnitFromRealm(state, dying.id)) delete state.units[dying.id] // cargo stays (FAQ); avatars refuse removal
    if (card && !card.isToken) state.players[card.owner].banished.push(card.id)
    pushLog(state, null, `${dying.name} crumbles to dust and is banished.`)
    return true
  },
  abilities: [{
    key: 'necromancy',
    label: 'Cast a dead minion (rises Undead)',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const art = ctx.state.artifacts[ctx.sourceId]
      const bearer = art?.carriedBy ? ctx.state.units[art.carriedBy] : null
      if (!bearer || (!effKeywords(ctx.state, bearer).spellcaster && !bearer.isAvatar)) return ctx.log('A Spellcaster must hold the Book.')
      // "a dead minion" is unqualified → a minion in EITHER cemetery may be cast
      const dead: string[] = []
      for (const pid of [0, 1] as PlayerId[]) {
        if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
        for (const id of ctx.state.players[pid].cemetery) {
          if (getCard(ctx.state.cards[id].name).type === 'Minion') dead.push(id)
        }
      }
      if (!dead.length) return ctx.log('No dead minions to raise.')
      ctx.ask({ kind: 'chooseCards', title: 'Read which name from the Book of the Dead?', data: { cards: dead.map((id) => `${ctx.state.cards[id].name} (${ctx.state.players[ctx.state.cards[id].owner].name})`), pick: 1, upTo: false } }, 'read', { dead })
    },
  }],
  conts: {
    read: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const cardId = (c.dead as string[])[idx]
      if (!cardId) return
      const p = ctx.state.players[ctx.controller]
      const cost = getCard(ctx.state.cards[cardId].name).cost ?? 0
      // the Bureau of Occult Control's (2) is a separate cost on top of the cast (FAQ) — both must be payable
      if (!ctx.state.players[ctx.state.cards[cardId].owner].cemetery.includes(cardId) || p.mana < cost + zoneAccessToll(ctx.state)) return ctx.log('Cannot pay its cost.')
      const spots = Object.values(ctx.state.sites).filter((s) => s.controller === ctx.controller && !s.isRubble).map((s) => ({ x: s.x, y: s.y }))
      if (!spots.length) return
      ctx.ask({ kind: 'chooseSquare', title: 'It rises where?', data: { squares: spots } }, 'rise', { cardId, cost })
    },
    rise: (ctx, c, sq) => {
      const p = ctx.state.players[ctx.controller]
      const cardId = c.cardId as string
      const site = sq ? siteAt(ctx.state, sq.x, sq.y) : null
      // the dead minion lies in its owner's cemetery (either player's)
      const cem = ctx.state.players[ctx.state.cards[cardId].owner].cemetery
      if (!site || site.controller !== ctx.controller || !cem.includes(cardId) || p.mana < (c.cost as number) + zoneAccessToll(ctx.state)) return
      payZoneToll(ctx.state, ctx.controller) // affordable: checked just above
      ctx.spendMana(ctx.controller, c.cost as number)
      cem.splice(cem.indexOf(cardId), 1)
      const name = ctx.state.cards[cardId].name
      const unitId = `u${ctx.state.nextId++}`
      // reanimated into the realm → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
        isAvatar: false, x: site.x, y: site.y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
        counters: { bookRisen: 1 },
      })
      pushLog(ctx.state, ctx.controller, `${name} rises again — pallid, hollow-eyed, Undead.`)
    },
  },
})

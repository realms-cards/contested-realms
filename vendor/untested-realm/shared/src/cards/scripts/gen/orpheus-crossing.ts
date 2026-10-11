import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'

// "Genesis → You're on Death's Door until your next turn. Summon a dead minion here."
registerScript("Orpheus' Crossing", {
  genesis: (ctx) => {
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
    if (!avatar) return
    if (!avatar.deathsDoor) {
      avatar.deathsDoor = true
      avatar.doorTurn = ctx.state.turn
      avatar.counters = { ...avatar.counters, orpheusDoor: 1 }
      pushLog(ctx.state, ctx.controller, `${avatar.name} walks the razor's edge between worlds…`)
    }
    const p = ctx.state.players[ctx.controller]
    const dead = p.cemetery.filter((id) => getCard(ctx.state.cards[id].name).type === 'Minion')
    if (!dead.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Lead which soul back across?', data: { cards: dead.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
      'cross',
      { dead },
    )
  },
  startOfTurn: (ctx) => {
    const avatar = Object.values(ctx.state.units).find((u) => u.isAvatar && u.controller === ctx.controller)
    if (avatar?.counters?.orpheusDoor) {
      delete avatar.counters.orpheusDoor
      avatar.deathsDoor = false
      avatar.doorTurn = undefined
      pushLog(ctx.state, ctx.controller, `${avatar.name} steps back from the brink.`)
    }
  },
  conts: {
    cross: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.sites[ctx.sourceId]
      if (typeof idx !== 'number' || !self) return
      const cardId = (c.dead as string[])[idx]
      const p = ctx.state.players[ctx.controller]
      if (!p.cemetery.includes(cardId)) return
      p.cemetery.splice(p.cemetery.indexOf(cardId), 1)
      const name = ctx.state.cards[cardId].name
      const unitId = `u${ctx.state.nextId++}`
      // reanimated into the realm → Genesis fires (FAQ 1242)
      effectSummonUnit(ctx.state, {
        id: unitId, cardId, name, owner: ctx.state.cards[cardId].owner, controller: ctx.controller,
        isAvatar: false, x: self.x, y: self.y, region: 'surface', tapped: false, damage: 0,
        enteredTurn: ctx.state.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      })
      pushLog(ctx.state, ctx.controller, `${name} follows the song back to the living.`)
    },
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog, effectSummonUnit } from '../../../engine/effects'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

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
    // "a dead minion" is unqualified → a minion in EITHER cemetery may cross back
    const dead: string[] = []
    for (const pid of [0, 1] as PlayerId[]) {
      if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
      for (const id of ctx.state.players[pid].cemetery) {
        if (getCard(ctx.state.cards[id].name).type === 'Minion') dead.push(id)
      }
    }
    if (!dead.length) return
    if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
    ctx.ask(
      { kind: 'chooseCards', title: 'Lead which soul back across?', data: { cards: dead.map((id) => `${ctx.state.cards[id].name} (${ctx.state.players[ctx.state.cards[id].owner].name})`), pick: 1, upTo: false } },
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
      if (!cardId) return
      // the dead minion lies in its owner's cemetery (either player's); it returns under OUR control
      const cem = ctx.state.players[ctx.state.cards[cardId].owner].cemetery
      if (!cem.includes(cardId)) return
      cem.splice(cem.indexOf(cardId), 1)
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

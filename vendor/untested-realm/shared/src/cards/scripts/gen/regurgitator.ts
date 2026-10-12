import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { inBounds, unitsAt } from '../../../engine/grid'
import { projectileCanHit, regionPresentAt } from '../../../engine/statics'

// 'At the end of your turn, Regurgitator must either fill its empty belly by
//  banishing a dead minion, or empty its full belly by shooting a projectile
//  that deals damage equal to the eaten minion's power.'
registerScript('Regurgitator', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    if (self.counters?.belly) {
      ctx.ask({ kind: 'chooseOption', title: `The Regurgitator hurls its meal (${self.counters.belly} damage) — which way?`, data: { options: ['n', 's', 'e', 'w'] } }, 'spew')
      return
    }
    // "there are any dead minions" — a dead minion in EITHER cemetery counts (not just yours).
    const dead: { id: string; owner: 0 | 1 }[] = []
    for (const owner of [0, 1] as (0 | 1)[]) {
      for (const id of ctx.state.players[owner].cemetery) {
        if (getCard(ctx.state.cards[id].name).type === 'Minion') dead.push({ id, owner })
      }
    }
    if (!dead.length) return
    ctx.ask({ kind: 'chooseCards', title: 'The Regurgitator swallows which corpse?', data: { cards: dead.map((d) => ctx.state.cards[d.id].name), pick: 1, upTo: false } }, 'gulp', { dead })
  },
  conts: {
    gulp: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const entry = (c.dead as { id: string; owner: 0 | 1 }[])[idx]
      const self = ctx.state.units[ctx.sourceId]
      if (!entry || !self) return
      const grave = ctx.state.players[entry.owner]
      const at = grave.cemetery.indexOf(entry.id)
      if (at < 0) return
      grave.cemetery.splice(at, 1)
      // a banished card always goes to ITS OWNER's banished pile
      ctx.state.players[ctx.state.cards[entry.id].owner].banished.push(entry.id)
      self.counters = { ...self.counters, belly: getCard(ctx.state.cards[entry.id].name).attack ?? 0 }
      pushLog(ctx.state, ctx.controller, 'GLUK. The Regurgitator is full.')
    },
    spew: (ctx, _c, dir) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || typeof dir !== 'string' || !self.counters?.belly) return
      const dmg = self.counters.belly
      delete self.counters.belly
      const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0
      const dy = dir === 'n' ? 1 : dir === 's' ? -1 : 0
      let { x, y } = self
      for (;;) {
        x += dx
        y += dy
        if (!inBounds(x, y)) break
        if (!regionPresentAt(ctx.state, self.region, x, y)) break // projectile stops at the void
        const hit = unitsAt(ctx.state, x, y, self.region).find((u) => projectileCanHit(ctx.state, u))
        if (hit) {
          ctx.dealDamage({ unit: hit.id }, dmg)
          pushLog(ctx.state, ctx.controller, `BLEUGH — ${hit.name} takes the full ${dmg}!`)
          return
        }
      }
    },
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import { cemeteryProtected, payZoneToll } from '../../../engine/statics'
import type { PlayerId } from '../../../engine/types'

// 'As an additional cost to cast this, you may banish a dead Knight, Sir, or
//  Dame. If you do, Vengeful Heir is summoned as a copy of that minion.'
registerScript('Vengeful Heir', {
  genesis: (ctx) => {
    // "a dead Knight, Sir, or Dame" is unqualified → from EITHER cemetery
    const knights: string[] = []
    for (const pid of [0, 1] as PlayerId[]) {
      if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
      for (const id of ctx.state.players[pid].cemetery) {
        const n = ctx.state.cards[id].name
        if (getCard(n).type === 'Minion' && (/\b(Knight|Sir|Dame)\b/.test(n) || getCard(n).subtypes.includes('Knight'))) knights.push(id)
      }
    }
    if (!knights.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Avenge whom? (skip to remain the Heir)', data: { cards: knights.map((id) => `${ctx.state.cards[id].name} (${ctx.state.players[ctx.state.cards[id].owner].name})`), pick: 1, upTo: true } },
      'avenge',
      { knights },
    )
  },
  conts: {
    avenge: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const cardId = (c.knights as string[])[idx]
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !cardId) return
      // the dead Knight lies in its owner's cemetery (either player's) → banished to its owner's pile
      const owner = ctx.state.players[ctx.state.cards[cardId].owner]
      if (!owner.cemetery.includes(cardId)) return
      if (!payZoneToll(ctx.state, ctx.controller)) return ctx.log('The Bureau of Occult Control demands (2) for cemetery access.')
      owner.cemetery.splice(owner.cemetery.indexOf(cardId), 1)
      owner.banished.push(cardId)
      self.name = ctx.state.cards[cardId].name
      self.damage = 0
      pushLog(ctx.state, ctx.controller, `The Heir takes up the mantle of ${self.name}!`)
    },
  },
})

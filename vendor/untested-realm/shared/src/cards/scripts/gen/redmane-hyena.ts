import { registerScript } from '../registry'
import { getCard } from '../../db'
import { cardSubtypesFor } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Banish up to three cards from cemeteries. If any are Demons, this
//  becomes one and gains +2 power permanently.'
registerScript('Redmane Hyena', {
  genesis: (ctx) => {
    const pool: string[] = []
    for (const p of ctx.state.players) pool.push(...p.cemetery)
    if (!pool.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'The Hyena gnaws which remains (up to 3)?', data: { cards: pool.map((id) => ctx.state.cards[id].name), pick: 3, upTo: true } },
      'gnaw',
      { pool },
    )
  },
  conts: {
    gnaw: (ctx, c, choice) => {
      const idxs = (Array.isArray(choice) ? choice : []).filter((i): i is number => typeof i === 'number')
      const pool = c.pool as string[]
      let demon = false
      for (const i of idxs.slice(0, 3)) {
        const cardId = pool[i]
        for (const p of ctx.state.players) {
          const at = p.cemetery.indexOf(cardId)
          if (at >= 0) {
            p.cemetery.splice(at, 1)
            p.banished.push(cardId)
            // "Demons" honors a Corruptor on the cemetery's owner (your Angels are Demons).
            if (cardSubtypesFor(ctx.state, p.id, ctx.state.cards[cardId].name).includes('Demon')) demon = true
          }
        }
      }
      const self = ctx.state.units[ctx.sourceId]
      if (demon && self) {
        self.counters = { ...self.counters, demonized: 1 }
        ctx.addPower(self.id, 2, 'permanent')
        pushLog(ctx.state, ctx.controller, 'The Hyena swells with demonic marrow!')
      }
    },
  },
  selfSubtypes: (_state, self, printed) =>
    self.counters?.demonized && !printed.includes('Demon') ? [...printed, 'Demon'] : printed,
})

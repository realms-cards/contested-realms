import { registerScript } from '../registry'
import { getCard } from '../../db'
import { cemeteryProtected } from '../../../engine/statics'
import { pushLog } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Once on your turn, Book Burners may banish a Document from the realm or a
// magic from a cemetery.'
registerScript('Book Burners', {
  abilities: [{
    key: 'burn',
    label: 'Burn a Document or a dead magic',
    cost: {},
    oncePerTurn: true,
    usableFromCemetery: true, // banishes any realm Document or a dead magic in either cemetery (no self-position, no tap) → Vivien can do it from the grave
    effect: (ctx) => {
      const docs = Object.values(ctx.state.artifacts).filter((a) => getCard(a.name).subtypes.includes('Document')).map((a) => `realm: ${a.name}`)
      const magics: string[] = []
      for (const pid of [0, 1] as PlayerId[]) {
        if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
        for (const id of ctx.state.players[pid].cemetery) {
          if (getCard(ctx.state.cards[id].name).type === 'Magic') magics.push(`cemetery: ${ctx.state.cards[id].name}`)
        }
      }
      const options = [...new Set([...docs, ...magics])]
      if (!options.length) return ctx.log('Nothing to burn.')
      ctx.ask({ kind: 'chooseOption', title: 'Burn what?', data: { options } }, 'toast')
    },
  }],
  conts: {
    toast: (ctx, _c, choice) => {
      const [where, name] = String(choice).split(': ')
      if (where === 'realm') {
        const art = Object.values(ctx.state.artifacts).find((a) => a.name === name)
        if (art) {
          const card = ctx.state.cards[art.cardId]
          if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
          if (art.carriedBy) {
            const carrier = ctx.state.units[art.carriedBy]
            if (carrier) carrier.carrying = carrier.carrying.filter((id) => id !== art.id)
          }
          delete ctx.state.artifacts[art.id]
          pushLog(ctx.state, ctx.controller, `${name} burns.`)
        }
      } else {
        for (const pid of [0, 1] as PlayerId[]) {
          if (cemeteryProtected(ctx.state, pid, ctx.controller)) continue // Wormelow Tump
          const p = ctx.state.players[pid]
          const idx = p.cemetery.findIndex((id) => ctx.state.cards[id].name === name)
          if (idx >= 0) {
            const [id] = p.cemetery.splice(idx, 1)
            p.banished.push(id)
            pushLog(ctx.state, ctx.controller, `${name} burns.`)
            return
          }
        }
      }
    },
  },
})

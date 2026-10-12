import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → You may return a minion that died this turn from your cemetery to your hand.'
registerScript('Miracle Workers', {
  genesis: (ctx) => {
    const dead: { name: string; controller: PlayerId }[] = ctx.state.flow?.diedThisTurn ?? []
    const p = ctx.state.players[ctx.controller]
    const candidates = p.cemetery.filter((id) => {
      const n = ctx.state.cards[id].name
      return getCard(n).type === 'Minion' && dead.some((d) => d.name === n && d.controller === ctx.controller)
    })
    if (!candidates.length) return
    ctx.ask(
      { kind: 'chooseCards', title: 'Miracle Workers: return which fallen minion to your hand?', data: { cards: candidates.map((id) => ctx.state.cards[id].name), pick: 1, upTo: true } },
      'revive',
      { candidates },
    )
  },
  conts: {
    revive: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      if (typeof idx !== 'number') return
      const id = (c.candidates as string[])[idx]
      const p = ctx.state.players[ctx.controller]
      const at = p.cemetery.indexOf(id)
      if (at >= 0) {
        p.cemetery.splice(at, 1)
        p.hand.push(id)
        pushLog(ctx.state, ctx.controller, `${ctx.state.cards[id].name} is miraculously restored.`)
      }
    },
  },
})

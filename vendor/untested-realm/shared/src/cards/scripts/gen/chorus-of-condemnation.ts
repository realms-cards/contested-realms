import { registerScript } from '../registry'
import { pushLog, toCemetery } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'

// 'Each player chooses another to discard a card.' (2p: each discards a card of their choice)
registerScript('Chorus of Condemnation', {
  onCast: (ctx) => {
    for (const pid of [ctx.controller, (1 - ctx.controller) as PlayerId]) {
      const p = ctx.state.players[pid]
      const names = [...new Set(p.hand.map((id) => ctx.state.cards[id].name))]
      if (names.length) {
        ctx.ask({ kind: 'chooseOption', title: 'Condemned: discard which card?', data: { options: names }, player: pid }, 'condemn', { pid })
      }
    }
  },
  conts: {
    condemn: (ctx, contCtx, choice) => {
      const p = ctx.state.players[contCtx.pid as PlayerId]
      const idx = p.hand.findIndex((id) => ctx.state.cards[id].name === choice)
      if (idx >= 0) {
        const [id] = p.hand.splice(idx, 1)
        toCemetery(ctx.state, id)
        pushLog(ctx.state, contCtx.pid, `${p.name} discards ${choice}.`)
      }
    },
  },
})

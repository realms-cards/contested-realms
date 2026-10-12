import { registerScript } from '../registry'
import { askOrder } from '../../../engine/effects'

// 'Genesis → Look at your next three spells. Put them back in any order.'
registerScript('Observatory', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.splice(0, 3)
    if (!top.length) return
    // full re-order back onto the top (first chosen = next draw)
    askOrder(ctx.state, ctx.controller, 'spellbook', top, 'top', 'Observatory: order your next spells (first = top)')
  },
})

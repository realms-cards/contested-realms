import { registerScript } from '../registry'
import { noteAddedToEnd } from '../../../engine/knowledge'

// 'Genesis → Look at your next four sites. Put three on the bottom of your atlas.'
registerScript('Crossroads', {
  genesis: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const top = p.atlas.splice(0, 4)
    if (!top.length) return
    // peeked cards ride the prompt ctx (hidden from the opponent), never synced flow (see Browse)
    ctx.ask(
      { kind: 'chooseCards', title: 'Crossroads: keep ONE site on top', data: { cards: top.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
      'pick',
      { pool: top },
    )
  },
  conts: {
    pick: (ctx, c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const pool: string[] = (c.pool as string[]) ?? []
      const idx = Array.isArray(choice) ? choice[0] : -1
      if (idx >= 0 && pool[idx] !== undefined) {
        const [keep] = pool.splice(idx, 1)
        noteAddedToEnd(ctx.state, ctx.controller, ctx.controller, 'atlas', 'top', [keep], () => p.atlas.unshift(keep))
      }
      noteAddedToEnd(ctx.state, ctx.controller, ctx.controller, 'atlas', 'bottom', pool, () => p.atlas.push(...pool))
    },
  },
})

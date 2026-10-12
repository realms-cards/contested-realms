import { registerScript } from '../registry'
import { pushLog, askOrder } from '../../../engine/effects'

// 'Look at your next seven spells. Put one in your hand and the rest on the
// bottom of your spellbook in any order.'
registerScript('Browse', {
  onCast: (ctx) => {
    const p = ctx.state.players[ctx.controller]
    const top = p.spellbook.splice(0, 7)
    if (!top.length) return
    // carry the peeked cards in the PROMPT ctx (viewFor shows a prompt's ctx ONLY to the addressed
    // player) — NOT in flow, which is synced to BOTH seats and leaked your top spells to the opponent.
    ctx.ask(
      { kind: 'chooseCards', title: 'Browse: take one spell', data: { cards: top.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } },
      'take',
      { pool: top },
    )
  },
  conts: {
    take: (ctx, c, choice) => {
      const p = ctx.state.players[ctx.controller]
      const pool: string[] = (c.pool as string[]) ?? []
      const idx = Array.isArray(choice) ? choice[0] : -1
      if (idx >= 0 && pool[idx] !== undefined) {
        const [id] = pool.splice(idx, 1)
        p.hand.push(id)
        pushLog(ctx.state, ctx.controller, `${p.name} takes ${ctx.state.cards[id].name}.`)
      }
      // the rest go to the bottom in a player-chosen order (matters for Kelp Cavern etc.)
      askOrder(ctx.state, ctx.controller, 'spellbook', pool, 'bottom', 'Browse: order the rest onto the bottom (last = very bottom)')
    },
  },
})

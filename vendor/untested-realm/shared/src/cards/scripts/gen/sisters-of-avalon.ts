import { registerScript } from '../registry'
import { discardableHandIds, toCemetery } from '../../../engine/effects'

// 'Spellcaster / Genesis → Discard a spell. Draw a spell.'
registerScript('Sisters of Avalon', {
  genesis: (ctx) => {
    // "Discard a spell. Draw a spell." — the draw is CONTINGENT on the discard, so with no spell to
    // discard the Genesis does nothing at all (you do NOT draw). The FAQ even makes you demonstrate an
    // empty-of-spells hand. Offer only spells (never a site).
    const spells = discardableHandIds(ctx.state, ctx.controller, true) // never Morgana's/Omphalos's locked spells
    if (!spells.length) return
    ctx.ask({ kind: 'chooseCards', title: 'Discard which spell?', data: { cards: spells.map((id) => ctx.state.cards[id].name), pick: 1, upTo: false } }, 'trade', { spellIds: spells })
  },
  conts: {
    // id-based: `choice` indexes the candidate spell list captured at ask time.
    trade: (ctx, c, choice) => {
      const idx = Array.isArray(choice) ? choice[0] : choice
      const p = ctx.state.players[ctx.controller]
      const ids = (c.spellIds as string[]) ?? []
      const id = typeof idx === 'number' ? ids[idx] : undefined
      if (typeof id === 'string' && p.hand.includes(id)) {
        p.hand.splice(p.hand.indexOf(id), 1)
        toCemetery(ctx.state, id)
      }
      ctx.draw(ctx.controller, 'spellbook')
    },
  },
})

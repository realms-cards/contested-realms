import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'

// 'Banish all nearby Spirits and auras. Draw a spell for each.'
registerScript('Sjaelström', {
  onCast: (ctx) => {
    const caster = ctx.caster!
    let n = 0
    for (const sq of nearbySquaresW(ctx.state, caster.x, caster.y)) {
      // nearby minion is region-locked to the source
      for (const u of unitsAt(ctx.state, sq.x, sq.y, caster.region)) {
        if (!u.isAvatar && effSubtypes(ctx.state, u).includes('Spirit')) {
          ctx.banish(u.id)
          n++
        }
      }
    }
    for (const r of Object.values(ctx.state.auras)) {
      if (r.squares.some((s) => nearbySquaresW(ctx.state, caster.x, caster.y).some((q) => q.x === s.x && q.y === s.y))) {
        const card = ctx.state.cards[r.cardId]
        if (card && !card.isToken) ctx.state.players[card.owner].banished.push(card.id)
        delete ctx.state.auras[r.id]
        n++
      }
    }
    if (n) ctx.draw(ctx.controller, 'spellbook', n)
  },
})

import { registerScript } from '../registry'
import { plunderCard } from '../multi-card-utils/plunder-card'

// ---------- threshold waivers ----------

// 'Whenever Sea Raider attacks and kills an enemy, its controller discards their
//  topmost spell. You may cast that spell once this turn, ignoring threshold.'
registerScript('Sea Raider', {
  onAttackKill: (ctx) => {
    // "its controller discards their topmost spell. You may cast that spell..." — the RAIDER'S
    // OWN controller discards from their own spellbook (not the opponent's), then may cast it.
    const me = ctx.state.players[ctx.controller]
    const cardId = me.spellbook.shift()
    if (cardId === undefined) return
    plunderCard(ctx, cardId)
  },
})

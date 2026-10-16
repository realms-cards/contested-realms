import { registerScript } from '../registry'
import { opponent } from '../../../engine/effects'
import { plunderCard } from '../multi-card-utils/plunder-card'

// ---------- threshold waivers ----------

// 'Whenever Sea Raider attacks and kills an enemy, its controller discards their
//  topmost spell. You may cast that spell once this turn, ignoring threshold.'
registerScript('Sea Raider', {
  onAttackKill: (ctx) => {
    // "its controller" is the KILLED ENEMY's controller — the raider plunders the defeated side's
    // spellbook, like Captain Baldassare — and "you" (the raider's controller) may cast it. The
    // victim is already gone here, and an enemy is by definition the opponent's.
    const foe = ctx.state.players[opponent(ctx.controller)]
    const cardId = foe.spellbook.shift()
    if (cardId === undefined) return
    plunderCard(ctx, cardId)
  },
})

import { registerScript } from '../registry'
import { getCard } from '../../db'
import { tutorCont, tutorFromSpellbook } from '../multi-card-utils/tutor-from-spellbook'
import { awardAchievement } from '../../../engine/achievements.catalog'

// 'Search your spellbook for an Ordinary card, reveal it, and put it into your hand.'
registerScript('Common Sense', {
  onCast: (ctx) => tutorFromSpellbook(ctx, 'Choose an Ordinary card', (n) => getCard(n).rarity === 'Ordinary'),
  conts: {
    tutorPick: (ctx, c, choice) => {
      const before = ctx.state.players[ctx.controller].hand.length
      tutorCont()(ctx, c, choice)
      // Exceptional/Elite/Unique sense — used Common Sense to fetch ANOTHER Common Sense (Nx in a turn).
      if (choice === 'Common Sense' && ctx.state.players[ctx.controller].hand.length > before) {
        const cs = ((ctx.state.flow ??= {}).commonSense ??= {}) as Record<number, { turn: number; count: number }>
        const rec = cs[ctx.controller]
        const count = rec && rec.turn === ctx.state.turn ? rec.count + 1 : 1
        cs[ctx.controller] = { turn: ctx.state.turn, count }
        awardAchievement(ctx.state, 'exceptional-sense', ctx.controller)
        if (count >= 2) awardAchievement(ctx.state, 'elite-sense', ctx.controller)
        if (count >= 3) awardAchievement(ctx.state, 'unique-sense', ctx.controller)
      }
    },
  },
})

import { registerScript } from '../registry'
import { isDisabled } from '../../../engine/statics'

// 'Ward / No minion is Evil, but all enter the realm tapped.'
registerScript('Saint of Redemption', {
  // 'No minion is Evil.' — FAQ: types are KEPT; Evil-ness is suppressed
  // globally via isEvilUnit()/isEvilCardName() in statics
  onUnitEnters: (ctx, entered) => {
    // A DISABLED Saint has no abilities — the "enter tapped" replacement turns off (reported bug:
    // "Saint ability funziona anche quando disabile"). emitEvent already skips a silenced Saint,
    // but disable isn't filtered there, so guard it here.
    const self = ctx.state.units[ctx.sourceId]
    if (!self || isDisabled(ctx.state, self)) return
    // "all enter the realm tapped" — FAQ (Oct 2026): this INCLUDES the Saint himself; Saint of
    // Redemption enters the realm tapped too (his own onUnitEnters fires for his own entry).
    if (!entered.isAvatar && !entered.tapped) entered.tapped = true
  },
})

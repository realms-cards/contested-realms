import { registerScript } from '../registry'

// 'Ward / No minion is Evil, but all enter the realm tapped.'
registerScript('Saint of Redemption', {
  // 'No minion is Evil.' — FAQ: types are KEPT; Evil-ness is suppressed
  // globally via isEvilUnit()/isEvilCardName() in statics
  onUnitEnters: (ctx, entered) => {
    // "all enter the realm tapped" applies once the Saint is IN play — so the Saint himself enters
    // UNtapped (his own entry precedes his static), only later minions arrive tapped.
    if (entered.id === ctx.sourceId) return
    if (!entered.isAvatar && !entered.tapped) entered.tapped = true
  },
})
